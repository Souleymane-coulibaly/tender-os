import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E2, audit Codex (correctif P1 "création Organization non atomique
 * ni réellement race-safe") — preuve RÉELLE HTTP + PostgreSQL que le bootstrap onboarding
 * (`createOrganizationAction` -> `POST /organizations` avec `reuseExistingIfPresent: true`) ne peut
 * plus créer deux organisations pour le même acteur sous concurrence réelle (double submit/retry
 * réseau, mission TEST B2 "Organization créée une seule fois malgré retry"). Fichier séparé (même
 * motif que `organization-memberships-seat-limit-concurrency-http.integration.spec.ts`) : chaque
 * spec d'intégration démarre sa propre instance `AppModule`/`AuthThrottlerGuard`.
 */
describe("POST /organizations — bootstrap idempotency REAL CONCURRENCY (real HTTP + PostgreSQL)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  const userIds: string[] = [];
  const organizationSlugs: string[] = [];

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Org Bootstrap Concurrency Test", termsAccepted: true }),
    });
    const user = (await registerRes.json()) as { id: string };
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    return { userId: user.id, token: accessToken };
  }

  function authHeaders(token: string): Record<string, string> {
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }

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
  }, 60000);

  afterAll(async () => {
    const memberships = await prisma.organizationMembership.findMany({ where: { userId: { in: userIds } } });
    const organizationIds = [...new Set(memberships.map((m) => m.organizationId))];
    await prisma.organizationMembership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    // Ceinture-bretelles — au cas où un appel aurait échoué avant d'avoir une Membership.
    await prisma.organization.deleteMany({ where: { slug: { in: organizationSlugs } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it("mission TEST B2/§7 — two truly concurrent bootstrap calls for a BRAND NEW actor (double submit/retry) create exactly ONE organization, both responses point at it", async () => {
    const user = await registerAndLogin(`org-bootstrap-conc-${randomUUID()}@smoke.test`);
    userIds.push(user.userId);

    const slugA = `bootstrap-race-a-${randomUUID()}`;
    const slugB = `bootstrap-race-b-${randomUUID()}`;
    organizationSlugs.push(slugA, slugB);

    const body = (slug: string) =>
      JSON.stringify({
        name: "Bootstrap Race Co",
        slug,
        defaultCurrency: "EUR",
        defaultTimezone: "Europe/Paris",
        reuseExistingIfPresent: true,
      });

    const [resA, resB] = await Promise.all([
      fetch(`${baseUrl}/api/v1/organizations`, { method: "POST", headers: authHeaders(user.token), body: body(slugA) }),
      fetch(`${baseUrl}/api/v1/organizations`, { method: "POST", headers: authHeaders(user.token), body: body(slugB) }),
    ]);

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    const [orgA, orgB] = (await Promise.all([resA.json(), resB.json()])) as [{ id: string }, { id: string }];

    // L'invariant central : les deux réponses HTTP pointent vers la MÊME organisation — jamais deux
    // créations distinctes, quel que soit l'ordre réel d'exécution des deux requêtes.
    expect(orgA.id).toBe(orgB.id);

    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: user.userId },
      include: { roles: { include: { role: true } } },
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.roles[0]?.role.code).toBe("OWNER");

    const organizations = await prisma.organization.findMany({ where: { id: memberships[0]!.organizationId } });
    expect(organizations).toHaveLength(1);
  });

  it("without reuseExistingIfPresent, a second explicit call still creates a genuinely SECOND organization (legitimate multi-org, never silently blocked)", async () => {
    const user = await registerAndLogin(`org-bootstrap-multi-${randomUUID()}@smoke.test`);
    userIds.push(user.userId);

    const slugA = `multi-org-a-${randomUUID()}`;
    const slugB = `multi-org-b-${randomUUID()}`;
    organizationSlugs.push(slugA, slugB);

    const first = await fetch(`${baseUrl}/api/v1/organizations`, {
      method: "POST",
      headers: authHeaders(user.token),
      body: JSON.stringify({ name: "First Org", slug: slugA, defaultCurrency: "EUR", defaultTimezone: "Europe/Paris" }),
    });
    expect(first.status).toBe(201);
    const firstOrg = (await first.json()) as { id: string };

    const second = await fetch(`${baseUrl}/api/v1/organizations`, {
      method: "POST",
      headers: authHeaders(user.token),
      body: JSON.stringify({ name: "Second Org", slug: slugB, defaultCurrency: "EUR", defaultTimezone: "Europe/Paris" }),
    });
    expect(second.status).toBe(201);
    const secondOrg = (await second.json()) as { id: string };

    expect(secondOrg.id).not.toBe(firstOrg.id);

    const memberships = await prisma.organizationMembership.findMany({ where: { userId: user.userId } });
    expect(memberships).toHaveLength(2);
  });
});
