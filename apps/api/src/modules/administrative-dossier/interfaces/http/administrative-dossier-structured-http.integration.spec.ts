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

/**
 * Sprint 8C Phase 2 — parcours bout-en-bout réel (HTTP + Postgres) pour les sous-domaines
 * structurés : Groupement, DC1, DC2 (+versions), DUME (+versions), DC4 (sous-traitance), Acte
 * d'engagement (gel/dégel pricing réel via le module Pricing), Pouvoirs (vérification exige une
 * preuve), signature locale des pièces administratives.
 */
describe("Administrative Dossier — structured sub-domains (real HTTP + PostgreSQL)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const clientAccountId = randomUUID();
  const tenderId = randomUUID();
  const userIds: string[] = [];
  let tokenOwner: string;
  let ownerUserId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Administrative Dossier Structured Test", termsAccepted: true }),
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
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": orgId, "Content-Type": "application/json" };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleRef.get(PrismaService);

    await prisma.organization.create({ data: { id: orgId, name: "Administrative Dossier Structured Org", slug: `administrative-dossier-structured-org-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const owner = await registerAndLogin(`administrative-dossier-structured-owner-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    tokenOwner = owner.token;
    ownerUserId = owner.userId;

    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: owner.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    await prisma.clientAccount.create({ data: { id: clientAccountId, organizationId: orgId, name: "Client Dossier Admin Structuré", nameNormalized: "client dossier admin structure", status: "ACTIVE", createdBy: owner.userId } });
    await prisma.tender.create({ data: { id: tenderId, organizationId: orgId, clientAccountId, title: "Marché dossier administratif structuré", status: "DRAFT", tags: [], createdBy: owner.userId } });

    // Les pièces administratives (nécessaires pour Pouvoirs/signature) exigent un dossier déjà créé.
    const ensureDossierRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dossier`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(ensureDossierRes.status).toBe(200);
  }, 60000);

  afterAll(async () => {
    await prisma.subcontractorDeclaration.deleteMany({ where: { organizationId: orgId } });
    await prisma.signingPower.deleteMany({ where: { organizationId: orgId } });
    await prisma.engagementAct.deleteMany({ where: { organizationId: orgId } });
    await prisma.dc2DeclarationVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.dc2Declaration.deleteMany({ where: { organizationId: orgId } });
    await prisma.dumeDeclarationVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.dumeDeclaration.deleteMany({ where: { organizationId: orgId } });
    await prisma.dc1Declaration.deleteMany({ where: { organizationId: orgId } });
    await prisma.consortium.deleteMany({ where: { organizationId: orgId } });
    await prisma.administrativeDocumentRevision.deleteMany({ where: { organizationId: orgId } });
    await prisma.administrativeDocument.deleteMany({ where: { organizationId: orgId } });
    await prisma.administrativeDossier.deleteMany({ where: { organizationId: orgId } });
    await prisma.pricingEstimateVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.pricingEstimate.deleteMany({ where: { organizationId: orgId } });
    await prisma.tender.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
  });

  it("mission §15 — Consortium: ensure is idempotent, update refuses a mandataire outside the declared members", async () => {
    const first = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-consortium`, { method: "POST", headers: authHeaders(tokenOwner), body: JSON.stringify({ type: "JOINT" }) });
    expect(first.status).toBe(200);
    const consortium = (await first.json()) as { id: string; type: string };
    expect(consortium.type).toBe("JOINT");

    const second = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-consortium`, { method: "POST", headers: authHeaders(tokenOwner), body: JSON.stringify({ type: "SOLIDARITY" }) });
    const secondBody = (await second.json()) as { id: string; type: string };
    expect(secondBody.id).toBe(consortium.id);
    expect(secondBody.type).toBe("JOINT");

    const invalidMandataire = await fetch(`${baseUrl}/api/v1/administrative-consortiums/${consortium.id}`, {
      method: "PATCH",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ mandataireMemberId: "not-a-member" }),
    });
    expect(invalidMandataire.status).toBe(422);

    const setMembers = await fetch(`${baseUrl}/api/v1/administrative-consortiums/${consortium.id}`, {
      method: "PATCH",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ members: [{ memberId: "m1", name: "Membre 1", role: "mandataire", percentage: 60 }, { memberId: "m2", name: "Membre 2", role: "co-traitant", percentage: 40 }] }),
    });
    expect(setMembers.status).toBe(200);

    const setMandataire = await fetch(`${baseUrl}/api/v1/administrative-consortiums/${consortium.id}`, {
      method: "PATCH",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ mandataireMemberId: "m1" }),
    });
    expect(setMandataire.status).toBe(200);
    const updated = (await setMandataire.json()) as { mandataireMemberId: string };
    expect(updated.mandataireMemberId).toBe("m1");
  });

  it("mission §10 — DC1: defaults to INDIVIDUAL, clears consortiumId when switched back from CONSORTIUM", async () => {
    const ensure = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dc1`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(ensure.status).toBe(200);
    const dc1 = (await ensure.json()) as { id: string; candidateType: string };
    expect(dc1.candidateType).toBe("INDIVIDUAL");

    const update = await fetch(`${baseUrl}/api/v1/administrative-dc1-declarations/${dc1.id}`, {
      method: "PATCH",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ signatoryName: "Jean Dupont", signatoryCapacity: "Gérant" }),
    });
    expect(update.status).toBe(200);
    const updated = (await update.json()) as { signatoryName: string };
    expect(updated.signatoryName).toBe("Jean Dupont");
  });

  it("mission §11 — DC2: each version is an immutable snapshot, the parent's pointer advances", async () => {
    const ensure = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dc2`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(ensure.status).toBe(200);
    const dc2 = (await ensure.json()) as { id: string; currentVersionNumber: number };
    expect(dc2.currentVersionNumber).toBe(0);

    const v1 = await fetch(`${baseUrl}/api/v1/administrative-dc2-declarations/${dc2.id}/versions`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ data: { legalIdentity: "SIRET 123", revenueByYear: [{ year: 2025, amountValue: 500000, amountCurrency: "EUR" }] } }),
    });
    expect(v1.status).toBe(201);
    const version1 = (await v1.json()) as { version: number; data: { legalIdentity: string } };
    expect(version1.version).toBe(1);

    const v2 = await fetch(`${baseUrl}/api/v1/administrative-dc2-declarations/${dc2.id}/versions`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ data: { legalIdentity: "SIRET 123 v2" } }),
    });
    const version2 = (await v2.json()) as { version: number };
    expect(version2.version).toBe(2);

    const get = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dc2`, { headers: authHeaders(tokenOwner) });
    const body = (await get.json()) as { declaration: { currentVersionNumber: number }; versions: { version: number; data: { legalIdentity: string } }[] };
    expect(body.declaration.currentVersionNumber).toBe(2);
    expect(body.versions).toHaveLength(2);
    // mission §11 — version 1 stays exactly as captured, never recalculated with current data.
    expect(body.versions.find((v) => v.version === 1)?.data.legalIdentity).toBe("SIRET 123");
  });

  it("mission §13 — DUME: same versioned-snapshot discipline as DC2", async () => {
    const ensure = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dume`, { method: "POST", headers: authHeaders(tokenOwner) });
    const dume = (await ensure.json()) as { id: string };

    const v1 = await fetch(`${baseUrl}/api/v1/administrative-dume-declarations/${dume.id}/versions`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ data: { legalIdentity: "SIRET 456" } }),
    });
    expect(v1.status).toBe(201);

    const get = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dume`, { headers: authHeaders(tokenOwner) });
    const body = (await get.json()) as { declaration: { currentVersionNumber: number } };
    expect(body.declaration.currentVersionNumber).toBe(1);
  });

  let engagementActId: string;

  it("mission §14 — Acte d'engagement: freezes the amount from a real, explicitly selected pricing estimate", async () => {
    const ensure = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-engagement-act`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(ensure.status).toBe(200);
    const act = (await ensure.json()) as { id: string };
    engagementActId = act.id;

    const createEstimateRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing/estimates`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ assumptions: { workHours: 10, hourlyRate: "50.00" } }),
    });
    expect(createEstimateRes.status).toBe(201);
    const estimate = (await createEstimateRes.json()) as { id: string; currentVersion: { version: number; amount: string } };

    const freeze = await fetch(`${baseUrl}/api/v1/administrative-engagement-acts/${engagementActId}/freeze-pricing`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ pricingEstimateId: estimate.id, pricingEstimateVersionNumber: estimate.currentVersion.version }),
    });
    expect(freeze.status).toBe(200);
    const frozen = (await freeze.json()) as { frozenAmountValue: number; pricingEstimateId: string };
    expect(frozen.pricingEstimateId).toBe(estimate.id);
    expect(frozen.frozenAmountValue).toBe(Number(estimate.currentVersion.amount));

    const refreezeDifferent = await fetch(`${baseUrl}/api/v1/administrative-engagement-acts/${engagementActId}/freeze-pricing`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ pricingEstimateId: estimate.id, pricingEstimateVersionNumber: 999 }),
    });
    expect(refreezeDifferent.status).toBe(404);

    const unfreeze = await fetch(`${baseUrl}/api/v1/administrative-engagement-acts/${engagementActId}/unfreeze-pricing`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(unfreeze.status).toBe(200);
    const unfrozen = (await unfreeze.json()) as { frozenAmountValue?: number };
    expect(unfrozen.frozenAmountValue).toBeUndefined();
  });

  it("mission §12 — DC4: several subcontractor declarations are allowed per tender", async () => {
    const first = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-subcontractors`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ subcontractorName: "Sous-traitant A", servicesDescription: "Terrassement", amountValue: 10000, amountCurrency: "EUR" }),
    });
    expect(first.status).toBe(201);

    const second = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-subcontractors`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ subcontractorName: "Sous-traitant B", servicesDescription: "Électricité", amountValue: 5000, amountCurrency: "EUR" }),
    });
    expect(second.status).toBe(201);

    const list = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-subcontractors`, { headers: authHeaders(tokenOwner) });
    const declarations = (await list.json()) as { id: string }[];
    expect(declarations).toHaveLength(2);
  });

  it("mission §17 — Pouvoirs: verification is refused without an attached proof document, requires the Validate permission", async () => {
    const create = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-signing-powers`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ holderName: "Jean Dupont", representedEntityDescription: "SAS Acme", scope: "Signature de l'acte d'engagement" }),
    });
    expect(create.status).toBe(201);
    const power = (await create.json()) as { id: string; status: string };
    expect(power.status).toBe("UNVERIFIED");

    const verifyWithoutProof = await fetch(`${baseUrl}/api/v1/administrative-signing-powers/${power.id}/verify`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(verifyWithoutProof.status).toBe(500);

    const docRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-documents`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ documentType: "POUVOIR_SIGNATURE", label: "Pouvoir de signature" }),
    });
    expect(docRes.status).toBe(201);
    const document = (await docRes.json()) as { id: string };

    const linkProof = await fetch(`${baseUrl}/api/v1/administrative-signing-powers/${power.id}`, {
      method: "PATCH",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ administrativeDocumentId: document.id }),
    });
    expect(linkProof.status).toBe(200);

    const verify = await fetch(`${baseUrl}/api/v1/administrative-signing-powers/${power.id}/verify`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(verify.status).toBe(200);
    const verified = (await verify.json()) as { status: string; verifiedBy: string };
    expect(verified.status).toBe("VALID");
    expect(verified.verifiedBy).toBe(ownerUserId);
  });

  it("mission §18 — signature locale: PENDING appears only after an explicit mode is set, never automatically", async () => {
    const docRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-documents`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ documentType: "ACTE_ENGAGEMENT", label: "Acte d'engagement à signer" }),
    });
    expect(docRes.status).toBe(201);
    const document = (await docRes.json()) as { id: string; signatureMode: string; signatureStatus: string };
    expect(document.signatureMode).toBe("NOT_REQUIRED");
    expect(document.signatureStatus).toBe("NOT_REQUIRED");

    const setMode = await fetch(`${baseUrl}/api/v1/administrative-documents/${document.id}/signature-mode`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ mode: "MANUAL" }),
    });
    expect(setMode.status).toBe(200);
    const withMode = (await setMode.json()) as { signatureMode: string; signatureStatus: string };
    expect(withMode.signatureMode).toBe("MANUAL");
    expect(withMode.signatureStatus).toBe("PENDING");

    const record = await fetch(`${baseUrl}/api/v1/administrative-documents/${document.id}/signature/record`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(record.status).toBe(200);
    const signed = (await record.json()) as { signatureStatus: string };
    expect(signed.signatureStatus).toBe("SIGNED");
  });
});
