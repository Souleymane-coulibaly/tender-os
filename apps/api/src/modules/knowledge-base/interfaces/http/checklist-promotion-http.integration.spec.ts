import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";

type EntrySummary = {
  id: string;
  status: string;
  validatedAt?: string;
  sourceTenderId?: string;
  sourceChecklistItemId?: string;
  promotedByUserId?: string;
  promotedAt?: string;
};

/**
 * V2 Sprint 8 §19 — preuve réelle contre HTTP + PostgreSQL de la promotion gouvernée d'un
 * `ChecklistItem` (Sprint 6) vers une `KnowledgeEntry` : jamais silencieuse (l'utilisateur choisit
 * catégorie/scope/tags/titre), jamais depuis un item non validé, et la nouvelle entrée n'hérite
 * JAMAIS la confiance (READY mais non validée) — mission §16 appliquée symétriquement à la source.
 */
describe("Checklist item promotion to Knowledge Base — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenContributorA: string;
  let contributorAUserId: string;
  let tokenOwnerB: string;
  let ownerAUserId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Promotion HTTP Test", termsAccepted: true }),
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

  async function addMembership(input: { organizationId: string; userId: string; role: (typeof OrganizationRole)[keyof typeof OrganizationRole] }): Promise<void> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: input.organizationId, userId: input.userId, role: input.role, occurredAt: new Date() }),
    );
  }

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  async function createClientAndTender(input: { organizationId: string; userId: string }): Promise<{ tenderId: string; clientAccountId: string }> {
    const suffix = randomUUID();
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: input.organizationId, name: `Client Promotion HTTP ${suffix}`, nameNormalized: `client promotion http ${suffix}`, status: "ACTIVE", createdBy: input.userId },
    });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: input.organizationId, clientAccountId: clientAccount.id, title: "Marche Promotion HTTP", status: "IN_ANALYSIS", tags: [], createdBy: input.userId },
    });
    return { tenderId: tender.id, clientAccountId: clientAccount.id };
  }

  async function createAndValidateChecklistItem(input: { tenderId: string; token: string; organizationId: string; title: string }): Promise<{ id: string }> {
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${input.tenderId}/checklist`, {
      method: "POST",
      headers: authHeaders(input.token, input.organizationId),
      body: JSON.stringify({ title: input.title, type: "ADMINISTRATIVE_DOCUMENT", requirementLevel: "MANDATORY", criticality: "BLOCKING" }),
    });
    expect(createRes.status).toBe(201);
    const item = (await createRes.json()) as { id: string };

    const validateRes = await fetch(`${baseUrl}/api/v1/tenders/${input.tenderId}/checklist/${item.id}/validate`, { method: "POST", headers: authHeaders(input.token, input.organizationId) });
    expect(validateRes.status).toBe(200);
    return item;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.listen(0);
    baseUrl = await app.getUrl();
    prisma = app.get(PrismaService);

    await prisma.organization.create({ data: { id: orgAId, name: "Promotion HTTP Org A", slug: `promotion-http-org-a-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    await prisma.organization.create({ data: { id: orgBId, name: "Promotion HTTP Org B", slug: `promotion-http-org-b-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const owner = await registerAndLogin(`promo-owner-${randomUUID()}@smoke.test`);
    tokenOwnerA = owner.token;
    ownerAUserId = owner.userId;
    userIds.push(owner.userId);
    await addMembership({ organizationId: orgAId, userId: owner.userId, role: OrganizationRole.Owner });

    const contributor = await registerAndLogin(`promo-contributor-${randomUUID()}@smoke.test`);
    tokenContributorA = contributor.token;
    contributorAUserId = contributor.userId;
    userIds.push(contributor.userId);
    await addMembership({ organizationId: orgAId, userId: contributor.userId, role: OrganizationRole.Contributor });

    const ownerB = await registerAndLogin(`promo-owner-b-${randomUUID()}@smoke.test`);
    tokenOwnerB = ownerB.token;
    userIds.push(ownerB.userId);
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });
  }, 30000);

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.knowledgeEntryTag.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.knowledgeEntryVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.knowledgeEntry.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.knowledgeSpace.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderChecklistItem.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
  }, 30000);

  it("promotes a VALIDATED checklist item into a new READY-but-unvalidated knowledge entry, carrying full provenance", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const item = await createAndValidateChecklistItem({ tenderId, token: tokenOwnerA, organizationId: orgAId, title: "Attestation URSSAF" });

    const promoteRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/${item.id}/promote-to-knowledge`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ title: "Modele attestation URSSAF", category: "ADMINISTRATIVE", tags: ["urssaf"] }),
    });
    expect(promoteRes.status).toBe(201);
    const entry = (await promoteRes.json()) as EntrySummary;

    expect(entry.status).toBe("READY");
    // Mission §16 appliquée symétriquement : une promotion n'est jamais une validation.
    expect(entry.validatedAt).toBeUndefined();
    expect(entry.sourceTenderId).toBe(tenderId);
    expect(entry.sourceChecklistItemId).toBe(item.id);
    expect(entry.promotedByUserId).toBe(ownerAUserId);
    expect(entry.promotedAt).toBeDefined();

    const getRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(getRes.status).toBe(200);
    const fetched = (await getRes.json()) as { title: string; tags: { label: string }[] };
    expect(fetched.title).toBe("Modele attestation URSSAF");
    expect(fetched.tags.some((tag) => tag.label === "urssaf")).toBe(true);
  });

  it("refuses to promote a checklist item that is not yet VALIDATED (409)", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ title: "Piece non validee", type: "ADMINISTRATIVE_DOCUMENT", requirementLevel: "MANDATORY", criticality: "BLOCKING" }),
    });
    const item = (await createRes.json()) as { id: string };

    const promoteRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/${item.id}/promote-to-knowledge`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ title: "Ne devrait jamais exister", category: "OTHER" }),
    });
    expect(promoteRes.status).toBe(409);
  });

  it("never across organizations (404, never leaking existence)", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const item = await createAndValidateChecklistItem({ tenderId, token: tokenOwnerA, organizationId: orgAId, title: "Attestation fiscale" });

    const crossOrgRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/${item.id}/promote-to-knowledge`, {
      method: "POST",
      headers: authHeaders(tokenOwnerB, orgBId),
      body: JSON.stringify({ title: "Tentative cross-org", category: "OTHER" }),
    });
    expect(crossOrgRes.status).toBe(404);
  });

  /** Correctif audit Codex P1-01 — `ManageChecklist` (org-tier) N'EST PAS suffisant seul : un
   *  CONTRIBUTOR de la MÊME organisation, sans affectation CLIENT réelle sur le client propriétaire
   *  de CE Tender, ne doit jamais pouvoir promouvoir un item de sa checklist, même validé et même
   *  avec un `tenderId`/`itemId` valides (fuite same-org cross-client par capitalisation). Réponse
   *  404, jamais 403 (convention "404-jamais-403" de `AssertClientAccessUseCase` pour un acteur
   *  SANS AUCUNE affectation — ne jamais révéler l'existence du client). */
  it("same-org cross-client: a CONTRIBUTOR without a real ClientAssignment on the Tender's client is refused (404, never a leak by capitalization)", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const item = await createAndValidateChecklistItem({ tenderId, token: tokenOwnerA, organizationId: orgAId, title: "Attestation sans affectation client" });

    // tokenContributorA a bien ManageChecklist (palier organisation) mais AUCUNE ClientAssignment
    // sur le client de CE Tender précis — la vraie restriction vit au palier client.
    const promoteRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/${item.id}/promote-to-knowledge`, {
      method: "POST",
      headers: authHeaders(tokenContributorA, orgAId),
      body: JSON.stringify({ title: "Ne devrait jamais être promue", category: "OTHER" }),
    });
    expect(promoteRes.status).toBe(404);
  });

  it("same-org cross-client: the SAME CONTRIBUTOR CAN promote once given a real ClientAssignment on the Tender's client (proves it's a genuine boundary, not a blanket auth failure)", async () => {
    const { tenderId, clientAccountId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: orgAId, clientAccountId, userId: contributorAUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId },
    });
    const item = await createAndValidateChecklistItem({ tenderId, token: tokenOwnerA, organizationId: orgAId, title: "Attestation avec affectation client" });

    const promoteRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/${item.id}/promote-to-knowledge`, {
      method: "POST",
      headers: authHeaders(tokenContributorA, orgAId),
      body: JSON.stringify({ title: "Promue par un contributeur autorisé", category: "OTHER" }),
    });
    expect(promoteRes.status).toBe(201);
  });
});
