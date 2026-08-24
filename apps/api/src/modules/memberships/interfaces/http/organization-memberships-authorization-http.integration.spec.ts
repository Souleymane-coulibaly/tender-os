import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../domain/membership-id.value-object";
import { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import { OrganizationRole } from "../../domain/organization-role";
import { PrismaMembershipRepository } from "../../infrastructure/prisma-membership.repository";
import { ACCESS_TOKEN_SERVICE, type AccessTokenService } from "../../../identity/application/ports/access-token.service";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E7 (Team & Users V2) — ferme explicitement E6-D1 (Members read
 * = PARTIAL / CODE_REVIEW_ONLY) et E6-D2 (Members write = PARTIAL), preuve HTTP + PostgreSQL réelle,
 * jamais une simple relecture de `ROLE_PERMISSIONS` (organization-permission.ts).
 *
 * Découverte de cet audit E7 (jamais vérifiée en E6) : `OrganizationPermission.MemberList` est
 * restreint à OWNER/ORGANIZATION_ADMIN — EXACTEMENT comme `IntegrationPermission.Read` (E6), PAS
 * ouvert à tout membre comme Billing/AI models. E6 avait laissé "Membres" visible à tout rôle dans
 * `NAV_SECTIONS` sans jamais vérifier cette hypothèse — corrigé dans ce même checkpoint
 * (`nav-sections.ts`, voir `isVisible: isOrganizationAdmin` sur l'item "Membres").
 */
describe("Organization Memberships — authorization matrix (real HTTP + PostgreSQL)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  const tokens = new Map<string, string>();
  const userIdByRole = new Map<string, string>();
  const membershipIdByRole = new Map<string, string>();

  function tokenFor(key: string): string {
    const token = tokens.get(key);
    if (!token) throw new Error(`No token registered for ${key}`);
    return token;
  }
  function membershipIdFor(key: string): string {
    const id = membershipIdByRole.get(key);
    if (!id) throw new Error(`No membership id registered for ${key}`);
    return id;
  }

  let accessTokenService: AccessTokenService;

  /** Checkpoint TENDEROS-2.1-P2.3-E7 — cette suite a besoin de bien plus d'acteurs distincts
   *  (7+ dans `beforeAll`, plusieurs de plus par test) que les suites HTTP existantes (qui restent
   *  toutes sous ~3 registrations). `register`/`login` partagent le même throttle IP `auth`
   *  (`{ ttl: 60_000, limit: 10 }`, `auth-throttler.guard.ts`) — un register+login par acteur
   *  dépasserait ce budget rien que dans `beforeAll`. Cette suite ne teste ni register ni login
   *  (couverts ailleurs), donc les acteurs sont créés directement (User + Session réels en base,
   *  jeton signé par le VRAI `AccessTokenService` de l'application) — jamais un mock/stub
   *  d'authentification, seule la route HTTP register/login elle-même est court-circuitée. */
  async function createActor(email: string): Promise<{ userId: string; token: string; email: string }> {
    const userId = randomUUID();
    await prisma.user.create({
      data: { id: userId, email, displayName: "Team Auth Test", status: "ACTIVE", passwordHash: "not-used-direct-actor-creation" },
    });
    const sessionId = randomUUID();
    await prisma.session.create({ data: { id: sessionId, userId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
    const token = accessTokenService.issue({ userId, sessionId }, 3600);
    return { userId, token, email };
  }

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-organization-id": organizationId };
  }

  async function addMembership(organizationId: string, userId: string, role: (typeof OrganizationRole)[keyof typeof OrganizationRole]): Promise<string> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    const id = MembershipId.from(randomUUID());
    await membershipRepository.save(OrganizationMembership.create({ id, organizationId, userId, role, occurredAt: new Date() }));
    return id.value;
  }

  const ROLES = [
    OrganizationRole.Owner,
    OrganizationRole.OrganizationAdmin,
    OrganizationRole.BidManager,
    OrganizationRole.Contributor,
    OrganizationRole.ExternalConsultant,
    OrganizationRole.ReadOnly,
  ] as const;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleRef.get(PrismaService);
    accessTokenService = moduleRef.get(ACCESS_TOKEN_SERVICE);

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Team Auth Org A", slug: `team-auth-org-a-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Team Auth Org B", slug: `team-auth-org-b-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    // ENTERPRISE (USERS_MAX = UNLIMITED) — ce fichier teste l'AUTORISATION, jamais les quotas de
    // sièges (déjà couverts par `organization-memberships-seat-limit-http.integration.spec.ts` et
    // sa preuve de concurrence dédiée) : aucune friction de seat ne doit interférer ici.
    await prisma.organizationSubscription.createMany({
      data: [
        { id: randomUUID(), organizationId: orgAId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
        { id: randomUUID(), organizationId: orgBId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
      ],
    });

    for (const role of ROLES) {
      const { userId, token } = await createActor(`team-${role.toLowerCase()}-${randomUUID()}@smoke.test`);
      userIds.push(userId);
      tokens.set(role, token);
      userIdByRole.set(role, userId);
      membershipIdByRole.set(role, await addMembership(orgAId, userId, role));
    }

    // Org B — un seul OWNER, cible des tests cross-tenant.
    const ownerB = await createActor(`team-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerB.userId);
    tokens.set("OWNER_B", ownerB.token);
    userIdByRole.set("OWNER_B", ownerB.userId);
    membershipIdByRole.set("OWNER_B", await addMembership(orgBId, ownerB.userId, OrganizationRole.Owner));
  }, 60000);

  afterAll(async () => {
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
  }, 60000);

  describe("E6-D1 — Members read (GET /organization-memberships)", () => {
    it("BLOQUANT — OWNER and ORGANIZATION_ADMIN can list members (200)", async () => {
      for (const role of [OrganizationRole.Owner, OrganizationRole.OrganizationAdmin]) {
        const res = await fetch(`${baseUrl}/api/v1/organization-memberships?limit=100`, { headers: authHeaders(tokenFor(role), orgAId) });
        expect(res.status).toBe(200);
      }
    });

    it("BLOQUANT — BID_MANAGER, CONTRIBUTOR, EXTERNAL_CONSULTANT, READ_ONLY cannot list members, even in read (403 PERMISSION_MISSING) — closes E6-D1", async () => {
      for (const role of [OrganizationRole.BidManager, OrganizationRole.Contributor, OrganizationRole.ExternalConsultant, OrganizationRole.ReadOnly]) {
        const res = await fetch(`${baseUrl}/api/v1/organization-memberships?limit=100`, { headers: authHeaders(tokenFor(role), orgAId) });
        expect(res.status).toBe(403);
        const body = (await res.json()) as { error: { code: string } };
        expect(body.error.code).toBe("PERMISSION_MISSING");
      }
    });
  });

  describe("E6-D2 — Members write (invite / role change / remove)", () => {
    it("BLOQUANT — CONTRIBUTOR cannot invite (403), OWNER can (201) — closes E6-D2 invite", async () => {
      const target = await createActor(`team-invite-target-${randomUUID()}@smoke.test`);
      userIds.push(target.userId);

      const forbidden = await fetch(`${baseUrl}/api/v1/organization-memberships/invite-by-email`, {
        method: "POST",
        headers: authHeaders(tokenFor(OrganizationRole.Contributor), orgAId),
        body: JSON.stringify({ email: target.email, role: "CONTRIBUTOR" }),
      });
      expect(forbidden.status).toBe(403);

      const target2 = await createActor(`team-invite-target2-${randomUUID()}@smoke.test`);
      userIds.push(target2.userId);
      const allowed = await fetch(`${baseUrl}/api/v1/organization-memberships/invite-by-email`, {
        method: "POST",
        headers: authHeaders(tokenFor(OrganizationRole.Owner), orgAId),
        body: JSON.stringify({ email: target2.email, role: "CONTRIBUTOR" }),
      });
      expect(allowed.status).toBe(201);
    });

    it("BLOQUANT — CONTRIBUTOR cannot change another member's role (403), ORGANIZATION_ADMIN can (200) — closes E6-D2 role change", async () => {
      const targetMembershipId = membershipIdFor(OrganizationRole.ExternalConsultant);

      const forbidden = await fetch(`${baseUrl}/api/v1/organization-memberships/${targetMembershipId}/role`, {
        method: "PATCH",
        headers: authHeaders(tokenFor(OrganizationRole.Contributor), orgAId),
        body: JSON.stringify({ role: "BID_MANAGER" }),
      });
      expect(forbidden.status).toBe(403);

      const allowed = await fetch(`${baseUrl}/api/v1/organization-memberships/${targetMembershipId}/role`, {
        method: "PATCH",
        headers: authHeaders(tokenFor(OrganizationRole.OrganizationAdmin), orgAId),
        body: JSON.stringify({ role: "BID_MANAGER" }),
      });
      expect(allowed.status).toBe(200);
      const body = (await allowed.json()) as { role: string };
      expect(body.role).toBe("BID_MANAGER");

      // Remise en état pour les tests suivants — jamais un effet de bord silencieux entre `it`.
      await fetch(`${baseUrl}/api/v1/organization-memberships/${targetMembershipId}/role`, {
        method: "PATCH",
        headers: authHeaders(tokenFor(OrganizationRole.OrganizationAdmin), orgAId),
        body: JSON.stringify({ role: "EXTERNAL_CONSULTANT" }),
      });
    });

    it("BLOQUANT — READ_ONLY cannot remove a member (403), OWNER can (200) — closes E6-D2 remove", async () => {
      const disposable = await createActor(`team-disposable-${randomUUID()}@smoke.test`);
      userIds.push(disposable.userId);
      const disposableMembershipId = await addMembership(orgAId, disposable.userId, OrganizationRole.Contributor);

      const forbidden = await fetch(`${baseUrl}/api/v1/organization-memberships/${disposableMembershipId}`, {
        method: "DELETE",
        headers: authHeaders(tokenFor(OrganizationRole.ReadOnly), orgAId),
      });
      expect(forbidden.status).toBe(403);

      const allowed = await fetch(`${baseUrl}/api/v1/organization-memberships/${disposableMembershipId}`, {
        method: "DELETE",
        headers: authHeaders(tokenFor(OrganizationRole.Owner), orgAId),
      });
      expect(allowed.status).toBe(204);
    });
  });

  describe("OWNER protection", () => {
    it("BLOQUANT — removing the only OWNER is refused (409 LAST_ORGANIZATION_OWNER_REQUIRED)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/organization-memberships/${membershipIdFor(OrganizationRole.Owner)}`, {
        method: "DELETE",
        headers: authHeaders(tokenFor(OrganizationRole.Owner), orgAId),
      });
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("LAST_ORGANIZATION_OWNER_REQUIRED");
    });

    it("BLOQUANT — OWNER cannot change their own role via the generic role-change route (409 OWNERSHIP_REQUIRES_TRANSFER)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/organization-memberships/${membershipIdFor(OrganizationRole.Owner)}/role`, {
        method: "PATCH",
        headers: authHeaders(tokenFor(OrganizationRole.Owner), orgAId),
        body: JSON.stringify({ role: "ORGANIZATION_ADMIN" }),
      });
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("OWNERSHIP_REQUIRES_TRANSFER");
    });

    it("BLOQUANT — ORGANIZATION_ADMIN cannot promote another member to OWNER via the generic role-change route (409 OWNERSHIP_REQUIRES_TRANSFER)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/organization-memberships/${membershipIdFor(OrganizationRole.BidManager)}/role`, {
        method: "PATCH",
        headers: authHeaders(tokenFor(OrganizationRole.OrganizationAdmin), orgAId),
        body: JSON.stringify({ role: "OWNER" }),
      });
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("OWNERSHIP_REQUIRES_TRANSFER");
    });
  });

  describe("Cross-tenant / multi-org (mission §33/§34)", () => {
    it("BLOQUANT — OWNER of Org A cannot list, invite into, or read members of Org B (404, OrganizationMembershipGuard — never a 403 that would confirm Org B's existence)", async () => {
      const list = await fetch(`${baseUrl}/api/v1/organization-memberships?limit=100`, { headers: authHeaders(tokenFor(OrganizationRole.Owner), orgBId) });
      expect(list.status).toBe(404);

      const invite = await fetch(`${baseUrl}/api/v1/organization-memberships/invite-by-email`, {
        method: "POST",
        headers: authHeaders(tokenFor(OrganizationRole.Owner), orgBId),
        body: JSON.stringify({ email: `nobody-${randomUUID()}@smoke.test`, role: "CONTRIBUTOR" }),
      });
      expect(invite.status).toBe(404);
    });

    it("BLOQUANT — IDOR : a legitimate OWNER session on Org A cannot change the role of a membership ID that actually belongs to Org B, even with a valid Org A header (404, never leaking or mutating Org B's row)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/organization-memberships/${membershipIdFor("OWNER_B")}/role`, {
        method: "PATCH",
        headers: authHeaders(tokenFor(OrganizationRole.Owner), orgAId),
        body: JSON.stringify({ role: "CONTRIBUTOR" }),
      });
      expect(res.status).toBe(404);

      // Preuve négative — le rôle réel dans Org B n'a pas bougé.
      const stillOwner = await fetch(`${baseUrl}/api/v1/organization-memberships?limit=100`, { headers: authHeaders(tokenFor("OWNER_B"), orgBId) });
      const body = (await stillOwner.json()) as { items: { userId: string; role: string }[] };
      expect(body.items.find((m) => m.userId === userIdByRole.get("OWNER_B"))?.role).toBe("OWNER");
    });

    it("BLOQUANT — IDOR : Org A cannot remove a membership ID belonging to Org B (404, row untouched)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/organization-memberships/${membershipIdFor("OWNER_B")}`, {
        method: "DELETE",
        headers: authHeaders(tokenFor(OrganizationRole.Owner), orgAId),
      });
      expect(res.status).toBe(404);

      const stillThere = await prisma.organizationMembership.findUnique({ where: { id: membershipIdFor("OWNER_B") } });
      expect(stillThere?.status).toBe("ACTIVE");
    });

    it("mission §33 — inviting an existing user (already CONTRIBUTOR in Org A) into Org B creates an independent Membership B, never touching Membership A", async () => {
      const dual = await createActor(`team-dual-org-${randomUUID()}@smoke.test`);
      userIds.push(dual.userId);
      await addMembership(orgAId, dual.userId, OrganizationRole.Contributor);

      const res = await fetch(`${baseUrl}/api/v1/organization-memberships/invite-by-email`, {
        method: "POST",
        headers: authHeaders(tokenFor("OWNER_B"), orgBId),
        body: JSON.stringify({ email: dual.email, role: "BID_MANAGER" }),
      });
      expect(res.status).toBe(201);

      const membershipRepository = new PrismaMembershipRepository(prisma);
      const membershipInA = await membershipRepository.findByOrganizationAndUser({ organizationId: orgAId, userId: dual.userId });
      const membershipInB = await membershipRepository.findByOrganizationAndUser({ organizationId: orgBId, userId: dual.userId });
      expect(membershipInA?.role).toBe("CONTRIBUTOR");
      expect(membershipInB?.role).toBe("BID_MANAGER");
    });
  });
});
