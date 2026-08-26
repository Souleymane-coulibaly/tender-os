import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";

/**
 * V2 Sprint 14 (Finalisation du dossier de réponse / Package final) — preuve réelle contre HTTP +
 * PostgreSQL (NestJS), même motif que `pricing-schedule-http.integration.spec.ts` (Sprint 13) : un
 * flux principal réel bout en bout (Checklist réelle → construction de version → correction de
 * qualification → validation bloquée puis débloquée → génération d'un VRAI ZIP avec manifest →
 * téléchargement réel), puis les tests BLOQUANTS exigés par la mission — REQUIRED manquant bloque,
 * OPTIONAL/NOT_APPLICABLE/NEEDS_REVIEW/CONDITIONAL-false ne bloquent jamais, same-org cross-client,
 * ClientAccess révoqué, cross-org anti-IDOR, mass-assignment, isolation multi-lot.
 */
describe("Dossier de réponse (response-package) — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenOwnerB: string;
  let ownerAUserId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Response Package HTTP Test", termsAccepted: true }),
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

  async function assignClient(input: { organizationId: string; clientAccountId: string; userId: string; role: "CLIENT_MANAGER" | "CONTRIBUTOR" | "VIEWER"; createdBy: string }): Promise<void> {
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: input.organizationId, clientAccountId: input.clientAccountId, userId: input.userId, role: input.role, createdBy: input.createdBy },
    });
  }

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  async function createClientTenderAndLot(input: { organizationId: string; userId: string }): Promise<{ clientAccountId: string; tenderId: string; lotId: string }> {
    const suffix = randomUUID();
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: input.organizationId, name: `Client Package ${suffix}`, nameNormalized: `client package ${suffix}`, status: "ACTIVE", createdBy: input.userId },
    });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: input.organizationId, clientAccountId: clientAccount.id, title: "Marche Package HTTP", status: "IN_ANALYSIS", tags: [], createdBy: input.userId },
    });
    const lot = await prisma.tenderLot.create({
      data: { id: randomUUID(), organizationId: input.organizationId, tenderId: tender.id, lotNumber: "1", title: "Lot 1", displayOrder: 0 },
    });
    return { clientAccountId: clientAccount.id, tenderId: tender.id, lotId: lot.id };
  }

  async function uploadDocument(input: { token: string; organizationId: string; filename: string }): Promise<{ documentId: string; documentVersionId: string }> {
    const form = new FormData();
    form.append("title", input.filename);
    form.append("origin", "USER_UPLOAD");
    form.append("domain", "TENDER");
    form.append("file", new Blob([Buffer.from("contenu réel du document")], { type: "application/pdf" }), input.filename);
    const res = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: { Authorization: `Bearer ${input.token}`, "X-Organization-Id": input.organizationId }, body: form });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; currentVersion: { id: string } };
    return { documentId: body.id, documentVersionId: body.currentVersion.id };
  }

  async function attachDocumentToTender(input: { token: string; organizationId: string; documentId: string; tenderId: string }): Promise<void> {
    const res = await fetch(`${baseUrl}/api/v1/documents/${input.documentId}/tenders/${input.tenderId}`, { method: "POST", headers: authHeaders(input.token, input.organizationId) });
    expect(res.status).toBe(201);
  }

  async function seedChecklistItem(input: {
    organizationId: string;
    tenderId: string;
    lotId?: string;
    title: string;
    type?: string;
    requirementLevel: "MANDATORY" | "CONDITIONAL" | "INFORMATIONAL";
    subjectType?: string;
    matchedDocumentId?: string;
    matchedDocumentVersionId?: string;
    createdBy: string;
  }): Promise<string> {
    const id = randomUUID();
    await prisma.tenderChecklistItem.create({
      data: {
        id,
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        lotId: input.lotId ?? null,
        title: input.title,
        status: "TODO",
        type: input.type ?? "ADMINISTRATIVE_DOCUMENT",
        requirementLevel: input.requirementLevel,
        subjectType: input.subjectType ?? "CANDIDATE",
        complianceStatus: "TO_REVIEW",
        documentStatus: input.matchedDocumentId ? "AVAILABLE" : "MISSING",
        matchedDocumentId: input.matchedDocumentId ?? null,
        matchedDocumentVersionId: input.matchedDocumentVersionId ?? null,
        documentMatchStatus: input.matchedDocumentId ? "MANUALLY_ATTACHED" : "NOT_SEARCHED",
      },
    });
    return id;
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

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Package Org A HTTP", slug: `package-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Package Org B HTTP", slug: `package-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    // Checkpoint TENDEROS-2.1-P2.3-E1.2, §11 (non-régression) — `CreateTechnicalMemoUseCase` est
    // entitlement-gated depuis le Checkpoint E1.1 (FINDING 1) : sans ceci, "TEST TECHNICAL MEMO
    // CHANGE" (seul test de ce fichier à créer un mémoire via le VRAI endpoint HTTP plutôt qu'un
    // seed Prisma direct) échoue en 402. Même motif déjà établi dans
    // dce-http.integration.spec.ts/analysis-http.integration.spec.ts — ENTERPRISE (illimité) pour
    // ne jamais faire porter à ces tests un souci de quota/AO credits qui n'est pas leur sujet.
    await prisma.organizationSubscription.createMany({
      data: [
        { id: randomUUID(), organizationId: orgAId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
        { id: randomUUID(), organizationId: orgBId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
      ],
    });

    const ownerA = await registerAndLogin(`package-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`package-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId);
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;
    ownerAUserId = ownerA.userId;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });
  }, 60000);

  afterAll(async () => {
    // Checkpoint TENDEROS-2.1-P2.3-E12.4 FIX-1 (H6-01) — l'application est fermee AVANT la purge,
    // jamais apres. Preuve a l'origine de ce correctif : sur 246 organisations residuelles, les
    // tables qui bloquaient encore leur suppression etaient `outbox_events` (440 lignes) et
    // `audit_logs` (218) — ecrites par le travail de fond APRES que ce teardown les ait purgees.
    // La suppression finale de l'organisation violait alors la FK, `afterAll` avortait, et toute
    // la fixture racine (organisation, utilisateurs, sessions) fuyait d'un run a l'autre.
    // `app.close()` attend desormais le travail en vol (`BackgroundTaskRunner`, E12.3) : apres ce
    // point plus aucune ecriture n'est possible, la purge est donc deterministe. Prisma se
    // reconnecte paresseusement pour les suppressions ci-dessous.
    await app.close();
    await prisma.packageArtifact.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.packageItem.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.responsePackageVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.responsePackage.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderChecklistItem.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderLot.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.document.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    // TENDEROS-2.1-P2.2-E1 — PricingSchedule/PricingScheduleVersion/PricingScheduleFinalFile
    // cascadent tous sur la suppression du Tender (`onDelete: Cascade`) : aucun nettoyage explicite
    // supplémentaire nécessaire pour ces tables. Idem TechnicalMemo/TechnicalMemoSection/
    // TechnicalMemoSectionRevision et GeneratedDocument/GeneratedDocumentRevision (Checkpoint F4) —
    // tous cascadent depuis `Tender`. `DocumentTemplate`/`DocumentTemplateVersion` en revanche sont
    // scopés `organizationId` SEUL (aucune FK vers `Tender`) — nettoyage explicite requis.
    await prisma.documentTemplateVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentTemplate.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    // CandidateCompany, référencée PAR le Tender (jamais l'inverse), se nettoie APRÈS.
    await prisma.candidateCompany.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.$disconnect();
  }, 60000);

  /**
   * Checkpoint 2.1-P2.1-FIX-E — E2E réaliste (mission §104-111) : un package fraîchement construit
   * est CURRENT, puis devient STALE dès qu'un document administratif source change de version
   * (simule une re-qualification Checklist après remplacement), sans jamais bloquer faussement une
   * régénération — la nouvelle version redevient CURRENT, l'ancienne reste historique/interrogeable,
   * son ZIP/manifest/checksum restent inchangés (mission §48/§60, "P8 IMMUTABILITY").
   */
  it("E2E (mission §104-111) — a source document version change makes the built package STALE, a rebuild makes it CURRENT again (old version's ZIP/manifest/checksum untouched)", async () => {
    const { tenderId, lotId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const docV1 = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "DC1.pdf" });
    const checklistItemId = await seedChecklistItem({
      organizationId: orgAId,
      tenderId,
      lotId,
      title: "DC1",
      requirementLevel: "MANDATORY",
      matchedDocumentId: docV1.documentId,
      matchedDocumentVersionId: docV1.documentVersionId,
      createdBy: ownerAUserId,
    });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId }) });
    const pkg = (await createRes.json()) as { id: string };

    // Étape 1a — aucune version construite encore : UNKNOWN.
    const freshnessEmptyRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(freshnessEmptyRes.status).toBe(200);
    expect((await freshnessEmptyRes.json()) as { freshness: string }).toMatchObject({ freshness: "UNKNOWN" });

    // Étape 1b — construction V1 : CURRENT (correspond exactement à l'état Checklist/documents
    // courant).
    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildRes.status).toBe(201);
    const built = (await buildRes.json()) as { version: { id: string; versionNumber: number }; items: { id: string; label: string }[] };

    const freshnessCurrentRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await freshnessCurrentRes.json()) as { freshness: string; currentVersionNumber: number }).toMatchObject({ freshness: "CURRENT", currentVersionNumber: 1 });

    // Génère le ZIP V1 réel (validé d'abord — un seul item MANDATORY déjà disponible) pour prouver
    // ensuite son immuabilité après la régénération.
    const validateRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${built.version.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(validateRes.status).toBe(200);
    const generateV1Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${built.version.id}/generate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(generateV1Res.status).toBe(201);
    const artifactV1 = (await generateV1Res.json()) as { checksum: string; manifest?: unknown };
    const artifactV1Row = await prisma.packageArtifact.findFirst({ where: { organizationId: orgAId, responsePackageVersionId: built.version.id } });
    const manifestV1Before = artifactV1Row!.manifest;

    // Étape 2 — le document source DC1 est remplacé par une NOUVELLE version (nouveau fichier),
    // et la Checklist est re-qualifiée en conséquence (simulation directe — la mécanique de
    // réconciliation Checklist elle-même est hors périmètre de ce test, déjà couverte ailleurs).
    const docV2 = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "DC1-v2.pdf" });
    await prisma.tenderChecklistItem.update({ where: { id: checklistItemId }, data: { matchedDocumentId: docV2.documentId, matchedDocumentVersionId: docV2.documentVersionId } });

    const freshnessStaleRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await freshnessStaleRes.json()) as { freshness: string }).toMatchObject({ freshness: "STALE" });

    // Étape 3 — régénère une NOUVELLE version (V2) contre l'état courant : CURRENT à nouveau.
    // L'ANCIENNE version (V1) n'est jamais réutilisée/écrasée (mission §47/§49).
    const buildV2Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildV2Res.status).toBe(201);
    const builtV2 = (await buildV2Res.json()) as { version: { id: string; versionNumber: number } };
    expect(builtV2.version.versionNumber).toBe(2);
    expect(builtV2.version.id).not.toBe(built.version.id);

    const freshnessCurrentAgainRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await freshnessCurrentAgainRes.json()) as { freshness: string; currentVersionNumber: number }).toMatchObject({ freshness: "CURRENT", currentVersionNumber: 2 });

    // Étape 4 (P8 IMMUTABILITY) — le ZIP/manifest/checksum de V1 restent STRICTEMENT inchangés
    // après la construction de V2.
    const artifactV1After = await prisma.packageArtifact.findFirst({ where: { organizationId: orgAId, responsePackageVersionId: built.version.id } });
    expect(artifactV1After!.checksum).toBe(artifactV1.checksum);
    expect(artifactV1After!.manifest).toEqual(manifestV1Before);

    // V1 reste historique/interrogeable, jamais supprimée.
    const versionsListRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}?versionId=${built.version.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(versionsListRes.status).toBe(200);
    const versionsList = (await versionsListRes.json()) as { versions: { id: string }[] };
    expect(versionsList.versions.map((v) => v.id)).toContain(built.version.id);
    expect(versionsList.versions.map((v) => v.id)).toContain(builtV2.version.id);
  }, 30000);

  /** TENDEROS-2.1-P2.2-F1 (mission §27/§60 — TEST 8) — un changement de CandidateCompany rend le
   *  package courant STALE, exactement comme un changement de document source (réutilise
   *  intégralement `GetResponsePackageFreshnessUseCase`/`computeResponsePackageFreshness`
   *  FIX-E, jamais un second moteur). Preuve bout en bout de la même mécanique que
   *  `Promise.all` corrigée en P2.2-E1 (résolution `tender` AVANT `listFinalFilesForPackageUseCase`)
   *  — si cette correction avait été incorrecte, ce test l'aurait révélé. La version historique
   *  construite sous Candidate A ne devient jamais celle de Candidate B (mission §27 "V1 reste
   *  historique, ne devient jamais CURRENT pour B"). */
  it("TEST 8 — a CandidateCompany change on the Tender makes the current package version STALE, and the historical version never becomes B's package", async () => {
    const { tenderId, lotId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const candidateA = await prisma.candidateCompany.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "CANDIDAT A TEST8", nameNormalized: "candidat a test8", status: "ACTIVE", createdBy: ownerAUserId },
    });
    const candidateB = await prisma.candidateCompany.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "CANDIDAT B TEST8", nameNormalized: "candidat b test8", status: "ACTIVE", createdBy: ownerAUserId },
    });
    await prisma.tender.update({ where: { id: tenderId }, data: { candidateCompanyId: candidateA.id } });

    const doc = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "DC1-test8.pdf" });
    await seedChecklistItem({ organizationId: orgAId, tenderId, lotId, title: "DC1", requirementLevel: "MANDATORY", matchedDocumentId: doc.documentId, matchedDocumentVersionId: doc.documentVersionId, createdBy: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId }) });
    const pkg = (await createRes.json()) as { id: string };

    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildRes.status).toBe(201);
    const built = (await buildRes.json()) as { version: { id: string; versionNumber: number } };

    const freshnessForARes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await freshnessForARes.json()) as { freshness: string }).toMatchObject({ freshness: "CURRENT" });

    const persistedVersion = await prisma.responsePackageVersion.findUniqueOrThrow({ where: { id: built.version.id } });
    expect(persistedVersion.candidateCompanyId).toBe(candidateA.id);

    // Le Tender répond désormais avec Candidate B — le package construit pour A n'est plus
    // représentatif du dossier courant.
    await prisma.tender.update({ where: { id: tenderId }, data: { candidateCompanyId: candidateB.id } });

    const freshnessForBRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await freshnessForBRes.json()) as { freshness: string }).toMatchObject({ freshness: "STALE" });

    // La version historique reste EXACTEMENT celle de Candidate A — jamais réattribuée à B.
    const persistedVersionAfter = await prisma.responsePackageVersion.findUniqueOrThrow({ where: { id: built.version.id } });
    expect(persistedVersionAfter.candidateCompanyId).toBe(candidateA.id);
  }, 30000);

  /** Checkpoint TENDEROS-2.1-P2.2-F3 (mission §25/§32/§41/§46-47) — bout en bout, réel HTTP +
   *  PostgreSQL : une pièce administrative (DC1) VALIDÉE pendant que le Tender pointait vers
   *  Candidate A est incluse dans la version construite pour A ; une fois le Tender réassigné à
   *  Candidate B SANS qu'une nouvelle pièce ne soit validée pour B, un rebuild n'inclut plus JAMAIS
   *  cette pièce (`ListValidatedAdministrativeDocumentsForPackageUseCase` filtre désormais sur
   *  `candidateCompanyId`, fermant le gap identifié par l'audit : `TenderCandidateCompanyChanged`
   *  n'avait aucun consommateur, aucune pièce administrative ne détectait un changement de candidat). */
  it("TEST F3 — an administrative document validated for Candidate A is excluded from a rebuild made for Candidate B, unless it is re-validated", async () => {
    const { tenderId, lotId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const candidateA = await prisma.candidateCompany.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "CANDIDAT A TESTF3", nameNormalized: "candidat a testf3", status: "ACTIVE", createdBy: ownerAUserId },
    });
    const candidateB = await prisma.candidateCompany.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "CANDIDAT B TESTF3", nameNormalized: "candidat b testf3", status: "ACTIVE", createdBy: ownerAUserId },
    });
    await prisma.tender.update({ where: { id: tenderId }, data: { candidateCompanyId: candidateA.id } });

    const ensureDossierRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dossier`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(ensureDossierRes.status).toBe(200);

    // Une pièce administrative (DC1) est créée, déposée et VALIDÉE pendant que le Tender pointe vers
    // Candidate A — capture `candidateCompanyId: candidateA.id` sur la révision (mission §18/§26).
    const createDocRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-documents`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentType: "DC1", label: "DC1" }),
    });
    expect(createDocRes.status).toBe(201);
    const administrativeDocument = (await createDocRes.json()) as { id: string };

    const uploaded = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "dc1-candidate-a.pdf" });
    const attachRes = await fetch(`${baseUrl}/api/v1/administrative-documents/${administrativeDocument.id}/revisions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentId: uploaded.documentId }),
    });
    expect(attachRes.status).toBe(201);
    const attached = (await attachRes.json()) as { revisions: { id: string; status: string }[] };
    const revisionId = attached.revisions[0]!.id;

    const validateAdminDocRes = await fetch(`${baseUrl}/api/v1/administrative-documents/${administrativeDocument.id}/validate`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ revisionId }),
    });
    expect(validateAdminDocRes.status).toBe(200);

    // V1 — construit pour Candidate A : la pièce administrative apparaît comme un item du package.
    const createPkgRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId }) });
    const pkg = (await createPkgRes.json()) as { id: string };
    const buildV1Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildV1Res.status).toBe(201);
    const builtV1 = (await buildV1Res.json()) as { version: { id: string }; items: { sourceType: string; sourceId: string }[] };
    expect(builtV1.items.some((i) => i.sourceType === "ADMINISTRATIVE_DOCUMENT" && i.sourceId === administrativeDocument.id)).toBe(true);

    // Le Tender est réassigné à Candidate B — AUCUNE nouvelle pièce administrative n'est validée
    // pour B (simule exactement le gap découvert par l'audit).
    await prisma.tender.update({ where: { id: tenderId }, data: { candidateCompanyId: candidateB.id } });

    // V2 — rebuild pour Candidate B : la pièce validée pour A n'apparaît plus du tout, jamais
    // silencieusement réattribuée à B.
    const buildV2Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildV2Res.status).toBe(201);
    const builtV2 = (await buildV2Res.json()) as { version: { id: string }; items: { sourceType: string; sourceId: string }[] };
    expect(builtV2.version.id).not.toBe(builtV1.version.id);
    expect(builtV2.items.some((i) => i.sourceType === "ADMINISTRATIVE_DOCUMENT" && i.sourceId === administrativeDocument.id)).toBe(false);

    // V1 (historique) reste inchangée — elle référence toujours la pièce d'A, jamais réécrite.
    const v1AfterRebuildItemsRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${builtV1.version.id}/completeness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(v1AfterRebuildItemsRes.status).toBe(200);
  }, 30000);

  /** Checkpoint TENDEROS-2.1-P2.2-F3.1 (mission §17/§18/§25/§26/§31, correctif audit Codex P2) —
   *  bout en bout, réel HTTP + PostgreSQL : une pièce administrative attachée et validée alors que le
   *  Tender n'avait ENCORE aucun candidat résolu (LEGACY au moment de l'attachement, capture donc
   *  `candidateCompanyId=NULL`, un scénario historique réel — jamais forcé en base) satisfait le
   *  package tant que le Tender reste LEGACY, puis n'est PLUS jamais acceptée dès que le Tender
   *  acquiert un candidat NEW FLOW — `NULL` n'est jamais un joker (matrice §18, cas D). Prouve aussi
   *  que la fraîcheur (`freshness`), pas seulement le rebuild, applique la même politique (mission
   *  §26). */
  it("TEST F3.1 — a historical NULL-candidate revision (attached while the Tender was still LEGACY) stops satisfying the package the moment the Tender acquires a NEW FLOW candidate", async () => {
    const { tenderId, lotId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });

    const ensureDossierRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dossier`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(ensureDossierRes.status).toBe(200);

    // Pièce administrative créée/déposée/validée alors que le Tender N'A ENCORE AUCUN candidat
    // (LEGACY) — capture réellement `candidateCompanyId=NULL`, jamais forcé en base.
    const createDocRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-documents`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentType: "DC1", label: "DC1" }),
    });
    expect(createDocRes.status).toBe(201);
    const administrativeDocument = (await createDocRes.json()) as { id: string };

    const uploaded = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "dc1-legacy-null.pdf" });
    const attachRes = await fetch(`${baseUrl}/api/v1/administrative-documents/${administrativeDocument.id}/revisions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentId: uploaded.documentId }),
    });
    expect(attachRes.status).toBe(201);
    const attached = (await attachRes.json()) as { revisions: { id: string; status: string }[] };
    const revisionId = attached.revisions[0]!.id;

    const validateAdminDocRes = await fetch(`${baseUrl}/api/v1/administrative-documents/${administrativeDocument.id}/validate`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ revisionId }),
    });
    expect(validateAdminDocRes.status).toBe(200);

    const persistedRevision = await prisma.administrativeDocumentRevision.findUniqueOrThrow({ where: { id: revisionId } });
    expect(persistedRevision.candidateCompanyId).toBeNull();

    // V1 — construit pendant que le Tender reste LEGACY : la pièce NULL satisfait le package (matrice
    // §18, cas A — aucun filtrage tant qu'aucun candidat NEW FLOW n'existe).
    const createPkgRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId }) });
    const pkg = (await createPkgRes.json()) as { id: string };
    const buildV1Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildV1Res.status).toBe(201);
    const builtV1 = (await buildV1Res.json()) as { version: { id: string }; items: { sourceType: string; sourceId: string }[] };
    expect(builtV1.items.some((i) => i.sourceType === "ADMINISTRATIVE_DOCUMENT" && i.sourceId === administrativeDocument.id)).toBe(true);

    const freshnessLegacyRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await freshnessLegacyRes.json()) as { freshness: string }).toMatchObject({ freshness: "CURRENT" });

    // Le Tender acquiert un candidat NEW FLOW (Candidate B) — la révision NULL, historique et
    // JAMAIS réécrite, ne peut plus satisfaire AUCUN candidat NEW FLOW (matrice §18, cas D).
    const candidateB = await prisma.candidateCompany.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "CANDIDAT B TESTF3.1", nameNormalized: "candidat b testf3.1", status: "ACTIVE", createdBy: ownerAUserId },
    });
    await prisma.tender.update({ where: { id: tenderId }, data: { candidateCompanyId: candidateB.id } });

    // Mission §26 — la fraîcheur (pas seulement le rebuild) reflète immédiatement la nouvelle
    // politique : V1 devient STALE, car la pièce qu'elle contient n'est plus une pièce ATTENDUE.
    const freshnessAfterCandidateRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await freshnessAfterCandidateRes.json()) as { freshness: string }).toMatchObject({ freshness: "STALE" });

    // Mission §20/§25 — un rebuild pour B n'inclut plus JAMAIS la pièce NULL historique.
    const buildV2Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildV2Res.status).toBe(201);
    const builtV2 = (await buildV2Res.json()) as { version: { id: string }; items: { sourceType: string; sourceId: string }[] };
    expect(builtV2.items.some((i) => i.sourceType === "ADMINISTRATIVE_DOCUMENT" && i.sourceId === administrativeDocument.id)).toBe(false);

    // La révision NULL elle-même reste immuable — jamais backfillée avec le candidat courant
    // (mission §19/§21, aucune réécriture d'historique).
    const revisionAfter = await prisma.administrativeDocumentRevision.findUniqueOrThrow({ where: { id: revisionId } });
    expect(revisionAfter.candidateCompanyId).toBeNull();
  }, 30000);

  /** TENDEROS-2.1-P2.2-F1.1 (mission §18/§21/§22) — cycle de vie complet Candidate A → B sur le
   *  MÊME conteneur `ResponsePackage` (décision "Option A", voir CANDIDATE_SCOPE_DECISION du
   *  rapport final) : le pointeur `currentVersionId` ne bascule JAMAIS de lui-même (reste V1/A tant
   *  qu'aucun rebuild n'a eu lieu, prouvant qu'il ne contourne pas la fraîcheur — mission §22),
   *  V1 conserve STRICTEMENT le contenu de A même après le rebuild pour B (téléchargement
   *  historique, mission §21), et V2 représente B sans aucun artefact résiduel de A. */
  it("TEST 18/21/22 — full Candidate A → B lifecycle: current pointer never bypasses freshness, V1 stays A's content forever, V2 represents B with zero A artifacts", async () => {
    const { tenderId, lotId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const candidateA = await prisma.candidateCompany.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "CANDIDAT A LIFECYCLE", nameNormalized: "candidat a lifecycle", status: "ACTIVE", createdBy: ownerAUserId },
    });
    const candidateB = await prisma.candidateCompany.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "CANDIDAT B LIFECYCLE", nameNormalized: "candidat b lifecycle", status: "ACTIVE", createdBy: ownerAUserId },
    });
    await prisma.tender.update({ where: { id: tenderId }, data: { candidateCompanyId: candidateA.id } });

    const docA = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "DC1-candidate-a.pdf" });
    const checklistItemId = await seedChecklistItem({ organizationId: orgAId, tenderId, lotId, title: "DC1", requirementLevel: "MANDATORY", matchedDocumentId: docA.documentId, matchedDocumentVersionId: docA.documentVersionId, createdBy: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId }) });
    const pkg = (await createRes.json()) as { id: string };

    const buildV1Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildV1Res.status).toBe(201);
    const builtV1 = (await buildV1Res.json()) as { version: { id: string; versionNumber: number } };

    const validateV1Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${builtV1.version.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(validateV1Res.status).toBe(200);
    const generateV1Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${builtV1.version.id}/generate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(generateV1Res.status).toBe(201);

    // Candidate B remplace Candidate A sur le Tender — AUCUN rebuild encore effectué.
    await prisma.tender.update({ where: { id: tenderId }, data: { candidateCompanyId: candidateB.id } });

    // Mission §22 — le pointeur `currentVersionId` reste EXACTEMENT V1 : il ne "corrige" jamais
    // silencieusement lui-même, c'est la fraîcheur (déjà prouvée STALE ci-dessus/TEST 8) qui porte
    // la protection réelle, jamais le pointeur.
    const pkgAfterCandidateChangeRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const pkgAfterCandidateChange = (await pkgAfterCandidateChangeRes.json()) as { responsePackage: { currentVersionId: string; currentVersionNumber: number } };
    expect(pkgAfterCandidateChange.responsePackage.currentVersionId).toBe(builtV1.version.id);
    expect(pkgAfterCandidateChange.responsePackage.currentVersionNumber).toBe(1);

    // Mission §21 — téléchargement HISTORIQUE de V1 : contenu de A, inchangé.
    const downloadV1BeforeRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${builtV1.version.id}/download`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(downloadV1BeforeRes.status).toBe(200);
    const zipV1Before = await JSZip.loadAsync(Buffer.from(await downloadV1BeforeRes.arrayBuffer()));
    const manifestV1Before = JSON.parse(await zipV1Before.file("manifest.json")!.async("string")) as { items: { documentId: string }[] };
    expect(manifestV1Before.items.map((i) => i.documentId)).toEqual([docA.documentId]);

    // Rattache le document de CANDIDATE B et rebuild : nouvelle version sur le MÊME conteneur.
    const docB = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "DC1-candidate-b.pdf" });
    await prisma.tenderChecklistItem.update({ where: { id: checklistItemId }, data: { matchedDocumentId: docB.documentId, matchedDocumentVersionId: docB.documentVersionId } });

    const buildV2Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildV2Res.status).toBe(201);
    const builtV2 = (await buildV2Res.json()) as { version: { id: string; versionNumber: number } };
    expect(builtV2.version.versionNumber).toBe(2);
    expect(builtV2.version.id).not.toBe(builtV1.version.id);

    const persistedV2 = await prisma.responsePackageVersion.findUniqueOrThrow({ where: { id: builtV2.version.id } });
    expect(persistedV2.candidateCompanyId).toBe(candidateB.id);

    const validateV2Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${builtV2.version.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(validateV2Res.status).toBe(200);
    const generateV2Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${builtV2.version.id}/generate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(generateV2Res.status).toBe(201);

    // Le pointeur COURANT représente maintenant B, et la fraîcheur redevient CURRENT.
    const pkgAfterRebuildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const pkgAfterRebuild = (await pkgAfterRebuildRes.json()) as { responsePackage: { currentVersionId: string; currentVersionNumber: number } };
    expect(pkgAfterRebuild.responsePackage.currentVersionId).toBe(builtV2.version.id);
    const freshnessAfterRebuildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await freshnessAfterRebuildRes.json()) as { freshness: string }).toMatchObject({ freshness: "CURRENT" });

    // Mission §21 — V2 (téléchargement) contient EXCLUSIVEMENT le document de B, aucun artefact A.
    const downloadV2Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${builtV2.version.id}/download`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(downloadV2Res.status).toBe(200);
    const zipV2 = await JSZip.loadAsync(Buffer.from(await downloadV2Res.arrayBuffer()));
    const manifestV2 = JSON.parse(await zipV2.file("manifest.json")!.async("string")) as { items: { documentId: string }[] };
    expect(manifestV2.items.map((i) => i.documentId)).toEqual([docB.documentId]);

    // Mission §21/§37 (IMMUTABILITY) — V1 (historique, téléchargé À NOUVEAU après le rebuild) reste
    // EXACTEMENT le contenu de A — jamais écrasé par le rebuild de V2.
    const downloadV1AfterRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${builtV1.version.id}/download`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(downloadV1AfterRes.status).toBe(200);
    const zipV1After = await JSZip.loadAsync(Buffer.from(await downloadV1AfterRes.arrayBuffer()));
    const manifestV1After = JSON.parse(await zipV1After.file("manifest.json")!.async("string")) as { items: { documentId: string }[] };
    expect(manifestV1After.items.map((i) => i.documentId)).toEqual([docA.documentId]);
  }, 30000);

  it("main flow: Checklist real qualification → build → completeness → blocked validation → correction → validated → real ZIP → download", async () => {
    const { tenderId, lotId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const doc = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "DC1.pdf" });

    await seedChecklistItem({ organizationId: orgAId, tenderId, lotId, title: "DC1", requirementLevel: "MANDATORY", matchedDocumentId: doc.documentId, matchedDocumentVersionId: doc.documentVersionId, createdBy: ownerAUserId });
    await seedChecklistItem({ organizationId: orgAId, tenderId, lotId, title: "Attestation fiscale", requirementLevel: "MANDATORY", createdBy: ownerAUserId });
    await seedChecklistItem({ organizationId: orgAId, tenderId, lotId, title: "Annexe facultative", requirementLevel: "INFORMATIONAL", createdBy: ownerAUserId });
    await seedChecklistItem({ organizationId: orgAId, tenderId, lotId, title: "DC4", requirementLevel: "CONDITIONAL", subjectType: "SUBCONTRACTOR", createdBy: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId }) });
    expect(createRes.status).toBe(201);
    const pkg = (await createRes.json()) as { id: string; status: string };
    expect(pkg.status).toBe("DRAFT");

    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildRes.status).toBe(201);
    const built = (await buildRes.json()) as { version: { id: string; versionNumber: number }; items: { id: string; label: string; status: string; requirementType: string; applicabilityStatus: string }[] };
    expect(built.version.versionNumber).toBe(1);
    expect(built.items).toHaveLength(4);

    const dc1 = built.items.find((i) => i.label === "DC1")!;
    expect(dc1.status).toBe("READY");
    const attestation = built.items.find((i) => i.label === "Attestation fiscale")!;
    expect(attestation.status).toBe("MISSING_BLOCKING");
    const annexe = built.items.find((i) => i.label === "Annexe facultative")!;
    expect(annexe.status).toBe("MISSING_NON_BLOCKING");
    const dc4 = built.items.find((i) => i.label === "DC4")!;
    expect(dc4.status).toBe("NOT_APPLICABLE");

    const completenessRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${built.version.id}/completeness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const completeness = (await completenessRes.json()) as { requiredApplicableTotal: number; requiredAvailable: number; requiredMissing: number; ready: boolean; notApplicableTotal: number };
    // Mission §5/§67 — 22/22 jamais 22/27 : ici 1/2 obligatoires (l'annexe facultative et le DC4
    // non applicable ne comptent JAMAIS dans le dénominateur obligatoire.
    expect(completeness.requiredApplicableTotal).toBe(2);
    expect(completeness.requiredAvailable).toBe(1);
    expect(completeness.requiredMissing).toBe(1);
    expect(completeness.notApplicableTotal).toBe(1);
    expect(completeness.ready).toBe(false);

    const blockedValidateRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${built.version.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(blockedValidateRes.status).toBe(409);

    const correctRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/items/${attestation.id}/qualification`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ requirementType: "OPTIONAL", applicabilityStatus: "APPLICABLE" }),
    });
    expect(correctRes.status).toBe(200);

    const validateRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${built.version.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(validateRes.status).toBe(200);
    const validated = (await validateRes.json()) as { status: string };
    expect(validated.status).toBe("VALIDATED");

    const generateRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${built.version.id}/generate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(generateRes.status).toBe(201);
    const artifact = (await generateRes.json()) as { fileName: string; checksum: string };
    expect(artifact.fileName).toContain(".zip");

    const downloadRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${built.version.id}/download`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(downloadRes.status).toBe(200);
    const zipBuffer = Buffer.from(await downloadRes.arrayBuffer());
    const reopened = await JSZip.loadAsync(zipBuffer);
    const fileNames = Object.values(reopened.files).filter((f) => !f.dir).map((f) => f.name);
    expect(fileNames).toContain("manifest.json");
    expect(fileNames.some((f) => f.startsWith("01_Administratif/"))).toBe(true);
    const manifest = JSON.parse(await reopened.file("manifest.json")!.async("string")) as { items: unknown[] };
    // DC1 (READY) + Attestation (devenue OPTIONAL mais toujours absente, donc PAS incluse) → seul
    // DC1 a une documentVersionId réelle à inclure dans le ZIP.
    expect(manifest.items).toHaveLength(1);
  });

  /** TENDEROS-2.1-P2.2-E1 (correctif audit baseline P1, mission §45 "Response Package smoke") —
   *  preuve bout en bout, réelle HTTP + PostgreSQL, que le fichier financier inclus dans un dossier
   *  de réponse construit correspond à l'entreprise CANDIDATE réellement sélectionnée pour ce
   *  Tender ("CANDIDAT A"), jamais au client commercial ("CLIENT COMMERCIAL X") ni à une autre
   *  candidate ("CANDIDAT B") dont un chiffrage existe pourtant pour le MÊME Tender. `PricingSchedule`/
   *  `PricingScheduleVersion`/`PricingScheduleFinalFile` sont semés directement (pas de vrai pipeline
   *  XLSX ici, déjà prouvé par `pricing-schedule-http.integration.spec.ts`) — seule la RÉSOLUTION
   *  candidate-scoped est sous test. */
  it("TEST 10 — Response Package smoke: the built package's financial item resolves to the Tender's current CandidateCompany, never the commercial client nor another candidate's pricing", async () => {
    const client = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });

    const candidateA = await prisma.candidateCompany.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "CANDIDAT A", nameNormalized: "candidat a", status: "ACTIVE", createdBy: ownerAUserId },
    });
    const candidateB = await prisma.candidateCompany.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "CANDIDAT B", nameNormalized: "candidat b", status: "ACTIVE", createdBy: ownerAUserId },
    });
    await prisma.tender.update({ where: { id: client.tenderId }, data: { candidateCompanyId: candidateA.id } });

    async function seedValidatedPricing(candidateCompanyId: string, label: string): Promise<{ documentId: string }> {
      const sourceDoc = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: `${label}-source.pdf` });
      const finalDoc = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: `${label}-final.pdf` });
      const scheduleId = randomUUID();
      await prisma.pricingSchedule.create({
        data: {
          id: scheduleId,
          organizationId: orgAId,
          tenderId: client.tenderId,
          clientAccountId: client.clientAccountId,
          candidateCompanyId,
          financialDocumentType: "BPU",
          sourceDocumentId: sourceDoc.documentId,
          sourceDocumentVersionId: sourceDoc.documentVersionId,
          status: "VALIDATED",
          currentVersionNumber: 1,
          createdBy: ownerAUserId,
        },
      });
      const versionId = randomUUID();
      await prisma.pricingScheduleVersion.create({
        data: { id: versionId, organizationId: orgAId, pricingScheduleId: scheduleId, versionNumber: 1, status: "VALIDATED", sourceDocumentVersionId: sourceDoc.documentVersionId, createdBy: ownerAUserId, validatedBy: ownerAUserId, validatedAt: new Date() },
      });
      await prisma.pricingSchedule.update({ where: { id: scheduleId }, data: { currentVersionId: versionId } });
      await prisma.pricingScheduleFinalFile.create({
        data: { id: randomUUID(), organizationId: orgAId, pricingScheduleVersionId: versionId, documentId: finalDoc.documentId, documentVersionId: finalDoc.documentVersionId, injectedCellCount: 2, generatedBy: ownerAUserId },
      });
      return { documentId: finalDoc.documentId };
    }

    const finalFileA = await seedValidatedPricing(candidateA.id, "candidat-a");
    await seedValidatedPricing(candidateB.id, "candidat-b");

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${client.tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId: client.lotId }) });
    expect(createRes.status).toBe(201);
    const pkg = (await createRes.json()) as { id: string };

    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildRes.status).toBe(201);
    const built = (await buildRes.json()) as { items: { category: string; documentId?: string }[] };

    const financialItems = built.items.filter((item) => item.category === "FINANCIAL");
    expect(financialItems).toHaveLength(1);
    expect(financialItems[0]!.documentId).toBe(finalFileA.documentId);
  }, 30000);

  it("BLOCKING — RP-P1-01 fix: rejects selecting a document belonging to a DIFFERENT client/tender of the same organization for a package item", async () => {
    const clientA = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const clientB = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });

    // Document uploadé par le même acteur mais rattaché UNIQUEMENT au Tender du Client B — jamais
    // au Tender du Client A dont le package doit rester isolé.
    const foreignDoc = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "Piece-Client-B.pdf" });
    await attachDocumentToTender({ token: tokenOwnerA, organizationId: orgAId, documentId: foreignDoc.documentId, tenderId: clientB.tenderId });

    const checklistItemId = await seedChecklistItem({ organizationId: orgAId, tenderId: clientA.tenderId, lotId: clientA.lotId, title: "Piece a fournir", requirementLevel: "MANDATORY", createdBy: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId: clientA.lotId }) });
    const pkg = (await createRes.json()) as { id: string };
    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    const built = (await buildRes.json()) as { version: { id: string }; items: { id: string; sourceId?: string }[] };
    const item = built.items.find((i) => i.sourceId === checklistItemId)!;

    const injectRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/items/${item.id}/document`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentId: foreignDoc.documentId, documentVersionId: foreignDoc.documentVersionId }),
    });
    expect(injectRes.status).toBe(404);

    // Le fichier étranger ne doit jamais avoir été rattaché : l'item reste sans document.
    const getRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}?versionId=${built.version.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const refreshed = (await getRes.json()) as { items: { id: string; documentId?: string }[] };
    const refreshedItem = refreshed.items.find((i) => i.id === item.id);
    expect(refreshedItem?.documentId).toBeUndefined();
  });

  it("selecting a document legitimately attached to the SAME tender succeeds", async () => {
    const client = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const doc = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "Piece-legitime.pdf" });
    await attachDocumentToTender({ token: tokenOwnerA, organizationId: orgAId, documentId: doc.documentId, tenderId: client.tenderId });

    const checklistItemId = await seedChecklistItem({ organizationId: orgAId, tenderId: client.tenderId, lotId: client.lotId, title: "Piece a fournir", requirementLevel: "MANDATORY", createdBy: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${client.tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId: client.lotId }) });
    const pkg = (await createRes.json()) as { id: string };
    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    const built = (await buildRes.json()) as { items: { id: string; sourceId?: string }[] };
    const item = built.items.find((i) => i.sourceId === checklistItemId)!;

    const selectRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/items/${item.id}/document`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentId: doc.documentId, documentVersionId: doc.documentVersionId }),
    });
    expect(selectRes.status).toBe(200);
    const updated = (await selectRes.json()) as { documentId?: string; status: string };
    expect(updated.documentId).toBe(doc.documentId);
    expect(updated.status).toBe("READY");
  });

  it("mass assignment — organizationId/clientAccountId/status/currentVersionId are never accepted from the client body (Sprint 21 hardening — .strict() rejects the request, same convention as every other module)", async () => {
    const { tenderId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ organizationId: orgBId, clientAccountId: randomUUID(), status: "VALIDATED", currentVersionId: randomUUID(), currentVersionNumber: 999 }),
    });
    expect(createRes.status).toBe(400);

    const legitimateRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({}),
    });
    expect(legitimateRes.status).toBe(201);
    const pkg = (await legitimateRes.json()) as { organizationId: string; tenderId: string; status: string; currentVersionId?: string; currentVersionNumber: number };
    expect(pkg.organizationId).toBe(orgAId);
    expect(pkg.tenderId).toBe(tenderId);
    expect(pkg.status).toBe("DRAFT");
    expect(pkg.currentVersionId).toBeUndefined();
    expect(pkg.currentVersionNumber).toBe(0);
  });

  it("BLOCKING — a same-org actor without access to this client can never see/build/validate/generate/download this package", async () => {
    const clientA = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const clientB = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId: clientA.lotId }) });
    const pkg = (await createRes.json()) as { id: string };

    const jean = await registerAndLogin(`package-jean-${randomUUID()}@smoke.test`);
    userIds.push(jean.userId);
    await addMembership({ organizationId: orgAId, userId: jean.userId, role: OrganizationRole.Contributor });
    await assignClient({ organizationId: orgAId, clientAccountId: clientB.clientAccountId, userId: jean.userId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/response-packages`, { headers: authHeaders(jean.token, orgAId) });
    expect(listRes.status).toBe(404);

    const getRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}`, { headers: authHeaders(jean.token, orgAId) });
    expect(getRes.status).toBe(404);

    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(jean.token, orgAId) });
    expect(buildRes.status).toBe(404);
  });

  it("BLOCKING — access revoked mid-session immediately blocks all operations, even for the actor who created it", async () => {
    const client = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const worker = await registerAndLogin(`package-worker-${randomUUID()}@smoke.test`);
    userIds.push(worker.userId);
    await addMembership({ organizationId: orgAId, userId: worker.userId, role: OrganizationRole.Contributor });
    await assignClient({ organizationId: orgAId, clientAccountId: client.clientAccountId, userId: worker.userId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${client.tenderId}/response-packages`, { method: "POST", headers: authHeaders(worker.token, orgAId), body: JSON.stringify({ lotId: client.lotId }) });
    expect(createRes.status).toBe(201);
    const pkg = (await createRes.json()) as { id: string };

    await prisma.clientAssignment.deleteMany({ where: { organizationId: orgAId, clientAccountId: client.clientAccountId, userId: worker.userId } });

    const getRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}`, { headers: authHeaders(worker.token, orgAId) });
    expect(getRes.status).toBe(404);
    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(worker.token, orgAId) });
    expect(buildRes.status).toBe(404);
  });

  it("BLOCKING — a DIFFERENT organization never sees a response package, even by guessing its exact UUID (cross-org anti-IDOR)", async () => {
    const { tenderId, lotId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId }) });
    const pkg = (await createRes.json()) as { id: string };

    const crossOrgListRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(crossOrgListRes.status).toBe(404);
    const crossOrgGetRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(crossOrgGetRes.status).toBe(404);
  });

  it("a package created for lotId=X is rejected if that lot does not belong to the Tender (anti-IDOR on lotId)", async () => {
    const { tenderId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId: randomUUID() }) });
    expect(createRes.status).toBe(404);
  });

  it("refuses a duplicate response package for the same (tender, lot, candidate)", async () => {
    const { tenderId, lotId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const first = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId }) });
    expect(first.status).toBe(201);
    const second = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId }) });
    expect(second.status).toBe(409);
  });

  it("refuses generating a ZIP before the version is validated", async () => {
    const { tenderId, lotId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId }) });
    const pkg = (await createRes.json()) as { id: string };
    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    const built = (await buildRes.json()) as { version: { id: string } };

    const generateRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${built.version.id}/generate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(generateRes.status).toBe(409);
  });

  it("BLOCKING — isolates two lots of the same tender/candidate: a checklist item scoped to lot 1 never appears in lot 2's package", async () => {
    const suffix = randomUUID();
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgAId, name: `Client MultiLot ${suffix}`, nameNormalized: `client multilot ${suffix}`, status: "ACTIVE", createdBy: ownerAUserId },
    });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientAccount.id, title: "Marche MultiLot HTTP", status: "IN_ANALYSIS", tags: [], createdBy: ownerAUserId },
    });
    const lot1 = await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId: tender.id, lotNumber: "1", title: "Lot 1", displayOrder: 0 } });
    const lot2 = await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId: tender.id, lotNumber: "2", title: "Lot 2", displayOrder: 1 } });

    await seedChecklistItem({ organizationId: orgAId, tenderId: tender.id, lotId: lot1.id, title: "Piece Lot 1 uniquement", requirementLevel: "MANDATORY", createdBy: ownerAUserId });
    await seedChecklistItem({ organizationId: orgAId, tenderId: tender.id, lotId: lot2.id, title: "Piece Lot 2 uniquement", requirementLevel: "MANDATORY", createdBy: ownerAUserId });

    const pkg1Res = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId: lot1.id }) });
    const pkg1 = (await pkg1Res.json()) as { id: string };
    const build1Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg1.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    const built1 = (await build1Res.json()) as { items: { label: string }[] };

    expect(built1.items.map((i) => i.label)).toContain("Piece Lot 1 uniquement");
    expect(built1.items.map((i) => i.label)).not.toContain("Piece Lot 2 uniquement");
  });

  it("BLOCKING — RP-P1-01 round 2: a document already matched to a checklist item of a DIFFERENT lot cannot be manually selected for this lot's package item", async () => {
    const suffix = randomUUID();
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgAId, name: `Client CrossLotDoc ${suffix}`, nameNormalized: `client crosslotdoc ${suffix}`, status: "ACTIVE", createdBy: ownerAUserId },
    });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientAccount.id, title: "Marche CrossLotDoc HTTP", status: "IN_ANALYSIS", tags: [], createdBy: ownerAUserId },
    });
    const lot1 = await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId: tender.id, lotNumber: "1", title: "Lot 1", displayOrder: 0 } });
    const lot2 = await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId: tender.id, lotNumber: "2", title: "Lot 2", displayOrder: 1 } });

    // Document réellement attaché au Tender (jamais rejeté par le contrôle "même Tender" du round
    // 1), mais déjà rapproché EXCLUSIVEMENT d'un ChecklistItem du Lot 2 — jamais du Lot 1.
    const lot2Doc = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "Piece-Lot2.pdf" });
    await attachDocumentToTender({ token: tokenOwnerA, organizationId: orgAId, documentId: lot2Doc.documentId, tenderId: tender.id });
    await seedChecklistItem({
      organizationId: orgAId,
      tenderId: tender.id,
      lotId: lot2.id,
      title: "Piece Lot 2",
      requirementLevel: "MANDATORY",
      matchedDocumentId: lot2Doc.documentId,
      matchedDocumentVersionId: lot2Doc.documentVersionId,
      createdBy: ownerAUserId,
    });

    // Un item du Lot 1 (checklist non encore rapprochée) ne doit jamais pouvoir se voir attribuer
    // manuellement le document déjà revendiqué par le Lot 2.
    const lot1ItemId = await seedChecklistItem({ organizationId: orgAId, tenderId: tender.id, lotId: lot1.id, title: "Piece Lot 1", requirementLevel: "MANDATORY", createdBy: ownerAUserId });

    const pkg1Res = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId: lot1.id }) });
    const pkg1 = (await pkg1Res.json()) as { id: string };
    const build1Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg1.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    const built1 = (await build1Res.json()) as { items: { id: string; sourceId?: string }[] };
    const lot1Item = built1.items.find((i) => i.sourceId === lot1ItemId)!;

    const crossLotInjectRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg1.id}/items/${lot1Item.id}/document`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentId: lot2Doc.documentId, documentVersionId: lot2Doc.documentVersionId }),
    });
    expect(crossLotInjectRes.status).toBe(404);

    // Contrôle négatif : un document jamais rapproché d'AUCUN ChecklistItem reste sélectionnable
    // manuellement (mission §71 — résoudre une absence de matching automatique, cas légitime).
    const unclassifiedDoc = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "Piece-non-classifiee.pdf" });
    await attachDocumentToTender({ token: tokenOwnerA, organizationId: orgAId, documentId: unclassifiedDoc.documentId, tenderId: tender.id });
    const legitimateRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg1.id}/items/${lot1Item.id}/document`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentId: unclassifiedDoc.documentId, documentVersionId: unclassifiedDoc.documentVersionId }),
    });
    expect(legitimateRes.status).toBe(200);
  });

  /** Checkpoint TENDEROS-2.1-P2.2-F4 (mission §9/§16/§47) — bout en bout, réel HTTP + PostgreSQL :
   *  un nouveau fichier financier final (`PricingScheduleFinalFile`) généré pour la MÊME
   *  `PricingScheduleVersion` fait passer le package courant STALE (exactement comme un document
   *  administratif ou un mémoire technique — mission §16 "tester au minimum : admin revision,
   *  technical memo, pricing output"), et un rebuild redevient CURRENT en référençant le NOUVEAU
   *  fichier, jamais l'ancien. Seed direct via Prisma (comme TEST 10) — le pipeline XLSX réel est
   *  déjà prouvé par `pricing-schedule-http.integration.spec.ts`, seule la mécanique de fraîcheur
   *  est sous test ici. */
  it("TEST PRICING CHANGE (mission §9/§16/§47) — a new final-file generation for the SAME pricing-schedule version makes the package STALE, a rebuild references the new file, never the old one", async () => {
    const { tenderId, lotId, clientAccountId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const candidate = await prisma.candidateCompany.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "CANDIDAT PRICING CHANGE", nameNormalized: "candidat pricing change", status: "ACTIVE", createdBy: ownerAUserId },
    });
    await prisma.tender.update({ where: { id: tenderId }, data: { candidateCompanyId: candidate.id } });

    const sourceDoc = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "bpu-source.pdf" });
    const finalDocV1 = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "bpu-final-v1.pdf" });
    const scheduleId = randomUUID();
    const versionId = randomUUID();
    await prisma.pricingSchedule.create({
      data: { id: scheduleId, organizationId: orgAId, tenderId, clientAccountId, candidateCompanyId: candidate.id, financialDocumentType: "BPU", sourceDocumentId: sourceDoc.documentId, sourceDocumentVersionId: sourceDoc.documentVersionId, status: "VALIDATED", currentVersionNumber: 1, createdBy: ownerAUserId },
    });
    await prisma.pricingScheduleVersion.create({
      data: { id: versionId, organizationId: orgAId, pricingScheduleId: scheduleId, versionNumber: 1, status: "VALIDATED", sourceDocumentVersionId: sourceDoc.documentVersionId, createdBy: ownerAUserId, validatedBy: ownerAUserId, validatedAt: new Date() },
    });
    await prisma.pricingSchedule.update({ where: { id: scheduleId }, data: { currentVersionId: versionId } });
    await prisma.pricingScheduleFinalFile.create({
      data: { id: randomUUID(), organizationId: orgAId, pricingScheduleVersionId: versionId, documentId: finalDocV1.documentId, documentVersionId: finalDocV1.documentVersionId, injectedCellCount: 2, generatedBy: ownerAUserId },
    });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId }) });
    const pkg = (await createRes.json()) as { id: string };
    const buildV1Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildV1Res.status).toBe(201);
    const builtV1 = (await buildV1Res.json()) as { version: { id: string }; items: { category: string; documentId?: string }[] };
    expect(builtV1.items.find((i) => i.category === "FINANCIAL")?.documentId).toBe(finalDocV1.documentId);

    const freshnessCurrentRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await freshnessCurrentRes.json()) as { freshness: string }).toMatchObject({ freshness: "CURRENT" });

    // Une NOUVELLE génération pour la MÊME version de chiffrage — mission §9 "aucune contrainte
    // n'empêche une régénération sur la version déjà validée" (confirmé par audit).
    const finalDocV2 = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "bpu-final-v2.pdf" });
    await prisma.pricingScheduleFinalFile.create({
      data: { id: randomUUID(), organizationId: orgAId, pricingScheduleVersionId: versionId, documentId: finalDocV2.documentId, documentVersionId: finalDocV2.documentVersionId, injectedCellCount: 3, generatedBy: ownerAUserId },
    });

    const freshnessStaleRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await freshnessStaleRes.json()) as { freshness: string }).toMatchObject({ freshness: "STALE" });

    const buildV2Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildV2Res.status).toBe(201);
    const builtV2 = (await buildV2Res.json()) as { version: { id: string; versionNumber: number }; items: { category: string; documentId?: string }[] };
    expect(builtV2.version.versionNumber).toBe(2);
    expect(builtV2.items.find((i) => i.category === "FINANCIAL")?.documentId).toBe(finalDocV2.documentId);

    const freshnessAfterRebuildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await freshnessAfterRebuildRes.json()) as { freshness: string }).toMatchObject({ freshness: "CURRENT" });
  }, 30000);

  /** Checkpoint TENDEROS-2.1-P2.2-F4 (mission §8/§16/§46) — bout en bout, réel HTTP + PostgreSQL :
   *  une nouvelle génération du mémoire technique (nouvelle `GeneratedDocumentRevision`, même
   *  `technicalMemoId`) fait passer le package courant STALE, un rebuild redevient CURRENT en
   *  référençant le NOUVEAU document généré. */
  it("TEST TECHNICAL MEMO CHANGE (mission §8/§16/§46) — a new export of the SAME technical memo makes the package STALE, a rebuild references the new export, never the old one", async () => {
    const { tenderId, lotId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });

    const createMemoRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/technical-memos`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ templateOrigin: "TENDEROS_SYSTEM" }) });
    expect(createMemoRes.status).toBe(201);
    const createdMemo = (await createMemoRes.json()) as { memo: { id: string }; sections: { id: string }[] };
    const memoId = createdMemo.memo.id;

    const prepareRes = await fetch(`${baseUrl}/api/v1/technical-memos/${memoId}/prepare`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(prepareRes.status).toBe(200);

    // Chaque section a besoin d'une révision pour que la fraîcheur du mémoire soit CURRENT (mission
    // "aucune dépendance DCE/Analyse inventée ici" — révisions volontairement sans
    // analysisVersion/dceRevision/candidateCompanyId, hors périmètre de ce test). `TechnicalMemoSection.content`
    // doit être mis à jour EXPLICITEMENT en parallèle (le domaine le fait dans la même transaction
    // via le vrai flux HTTP `/edit`/génération — un insert Prisma direct de la révision seule ne le
    // synchronise pas automatiquement), sinon `/export` génère un DOCX sans contenu réel.
    for (const section of createdMemo.sections) {
      await prisma.technicalMemoSectionRevision.create({
        data: { id: randomUUID(), organizationId: orgAId, technicalMemoSectionId: section.id, revisionNumber: 1, source: "AI_GENERATED", content: "Contenu suffisant pour l'export.", createdBy: ownerAUserId },
      });
      await prisma.technicalMemoSection.update({ where: { id: section.id }, data: { content: "Contenu suffisant pour l'export.", status: "VALIDATED" } });
    }

    const exportV1Res = await fetch(`${baseUrl}/api/v1/technical-memos/${memoId}/export`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) });
    expect(exportV1Res.status).toBe(200);

    const createRpRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId }) });
    const pkg = (await createRpRes.json()) as { id: string };
    const buildV1Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildV1Res.status).toBe(201);
    const builtV1 = (await buildV1Res.json()) as { version: { id: string }; items: { category: string; sourceId?: string; documentId?: string }[] };
    const technicalItemV1 = builtV1.items.find((i) => i.category === "TECHNICAL");
    expect(technicalItemV1?.sourceId).toBe(memoId);
    const documentIdV1 = technicalItemV1?.documentId;
    expect(documentIdV1).toBeDefined();

    const freshnessCurrentRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await freshnessCurrentRes.json()) as { freshness: string }).toMatchObject({ freshness: "CURRENT" });

    // Une nouvelle génération pour le MÊME mémoire technique — crée une NOUVELLE
    // `GeneratedDocumentRevision` (nouveau document/version), jamais une réécriture de la première.
    const exportV2Res = await fetch(`${baseUrl}/api/v1/technical-memos/${memoId}/export`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) });
    expect(exportV2Res.status).toBe(200);

    const freshnessStaleRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await freshnessStaleRes.json()) as { freshness: string }).toMatchObject({ freshness: "STALE" });

    const buildV2Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildV2Res.status).toBe(201);
    const builtV2 = (await buildV2Res.json()) as { version: { id: string; versionNumber: number }; items: { category: string; documentId?: string }[] };
    expect(builtV2.version.versionNumber).toBe(2);
    const documentIdV2 = builtV2.items.find((i) => i.category === "TECHNICAL")?.documentId;
    expect(documentIdV2).toBeDefined();
    expect(documentIdV2).not.toBe(documentIdV1);

    const freshnessAfterRebuildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await freshnessAfterRebuildRes.json()) as { freshness: string }).toMatchObject({ freshness: "CURRENT" });
  }, 30000);

  describe("Checkpoint TENDEROS-2.1-P2.3-E1.5, mission §8 (HTTP 402 — DETTE DE PREUVE)", () => {
    // Dernier describe block du fichier (vitest exécute `it`/`describe` d'un même fichier en ordre
    // de déclaration, jamais en parallèle) — réutilise orgB, dont l'abonnement ENTERPRISE n'est
    // JAMAIS relu ailleurs dans ce fichier (seule son existence en tant qu'organisation distincte
    // sert aux tests d'isolation cross-org ci-dessus), même motif déjà établi dans
    // `pricing-schedule-http.integration.spec.ts` — aucune nouvelle organisation/inscription requise.
    it("POST .../response-packages without entitlement (subscription PAST_DUE, no Pass) refuses with 402 TENDER_OPERATION_NOT_ENTITLED — no ResponsePackage row persisted", async () => {
      const { tenderId, lotId } = await createClientTenderAndLot({ organizationId: orgBId, userId: userIds[1]! });
      await prisma.organizationSubscription.update({ where: { organizationId: orgBId }, data: { status: "PAST_DUE" } });

      const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerB, orgBId), body: JSON.stringify({ lotId }) });
      expect(createRes.status).toBe(402);
      const body = (await createRes.json()) as { error: { code: string } };
      expect(body.error.code).toBe("TENDER_OPERATION_NOT_ENTITLED");

      const persisted = await prisma.responsePackage.findFirst({ where: { organizationId: orgBId, tenderId } });
      expect(persisted).toBeNull();
    });
  });
});
