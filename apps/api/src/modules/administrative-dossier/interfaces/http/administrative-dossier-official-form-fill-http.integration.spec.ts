import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

const DC1_TEMPLATE_PATH = join(__dirname, "..", "..", "assets", "dc1-template-v1.docx");
const OOXML_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * V2 Sprint 11 — préremplissage du VRAI formulaire DC1 officiel (gabarit dérivé du DOCX
 * gouvernemental réel préparé par `scripts/prepare-dc1-template.ts`, moteur de fusion Sprint 10),
 * distinct de la suite Sprint 8C.1 (`administrative-dossier-official-form-http.integration.spec.ts`
 * — Annexe TenderOS, moteur IR séparé). Preuve bout-en-bout : readiness calculée honnêtement depuis
 * de VRAIES données métier (ClientAccount/CompanyLegalIdentity/Dc1Declaration), aucun effet de bord
 * tant que "generate" n'est pas appelé explicitement (mission §5/§6 "la génération reste
 * facultative"), génération produisant un VRAI DOCX contenant les données réelles, et isolation
 * same-org cross-client (mission §51/§52).
 */
describe("Administrative Dossier — V2 Sprint 11 DC1 real official form fill (real HTTP + PostgreSQL)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const userIds: string[] = [];
  let tokenOwner: string;
  let tokenContributor: string;
  let contributorUserId: string;

  const dc1TemplateBuffer = readFileSync(DC1_TEMPLATE_PATH);

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "DC1 Fill Test", termsAccepted: true }),
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

  function jsonHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": orgId, "Content-Type": "application/json" };
  }
  function multipartHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": orgId };
  }

  async function addMembership(input: { userId: string; role: (typeof OrganizationRole)[keyof typeof OrganizationRole] }): Promise<void> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: input.userId, role: input.role, occurredAt: new Date() }));
  }

  /** Enregistre le gabarit DC1 réel préparé (create -> upload multipart réel -> activate), exactement
   *  la même séquence que la suite Sprint 10, jamais une seconde implémentation. */
  async function seedActiveDc1Template(): Promise<{ templateId: string }> {
    const createRes = await fetch(`${baseUrl}/api/v1/document-templates`, { method: "POST", headers: jsonHeaders(tokenOwner), body: JSON.stringify({ scope: "SYSTEM", name: "DC1" }) });
    expect(createRes.status).toBe(201);
    const template = (await createRes.json()) as { id: string };

    const fieldMappings = [
      { fieldKey: "tender.buyerIdentification", label: "Acheteur", fieldType: "STRING", required: true },
      { fieldKey: "tender.consultationObject", label: "Objet", fieldType: "STRING", required: true },
      { fieldKey: "dc1.scopeMarcheUnique", label: "Marché unique", fieldType: "CHECKBOX", required: false },
      { fieldKey: "dc1.scopeTousLots", label: "Tous les lots", fieldType: "CHECKBOX", required: false },
      { fieldKey: "dc1.scopeLotSpecifique", label: "Lot(s) spécifique(s)", fieldType: "CHECKBOX", required: false },
      { fieldKey: "dc1.lotNumeros", label: "Numéros de lot", fieldType: "STRING", required: false },
      { fieldKey: "dc1.candidatSeul", label: "Candidat seul", fieldType: "CHECKBOX", required: true },
      { fieldKey: "candidate.tradeName", label: "Nom du candidat", fieldType: "STRING", required: true },
      { fieldKey: "candidate.address", label: "Adresse du candidat", fieldType: "STRING", required: true },
      { fieldKey: "candidate.email", label: "Courriel", fieldType: "STRING", required: false },
      { fieldKey: "candidate.phone", label: "Téléphone", fieldType: "STRING", required: false },
      { fieldKey: "candidate.siret", label: "SIRET du candidat", fieldType: "STRING", required: true },
      { fieldKey: "dc1.groupementEntreprises", label: "Groupement", fieldType: "CHECKBOX", required: true },
      { fieldKey: "dc1.groupementConjoint", label: "Groupement conjoint", fieldType: "CHECKBOX", required: false },
      { fieldKey: "dc1.groupementSolidaire", label: "Groupement solidaire", fieldType: "CHECKBOX", required: false },
      { fieldKey: "dc1.mandataireSolidaireNon", label: "Mandataire non solidaire", fieldType: "CHECKBOX", required: false },
      { fieldKey: "dc1.mandataireSolidaireOui", label: "Mandataire solidaire", fieldType: "CHECKBOX", required: false },
      { fieldKey: "dc1.members", label: "Membres du groupement", fieldType: "TABLE", required: false },
      { fieldKey: "dc1.exclusionAttestation", label: "Attestation d'exclusion", fieldType: "CHECKBOX", required: true },
      { fieldKey: "dc1.proofUrl", label: "URL preuve", fieldType: "STRING", required: false },
      { fieldKey: "dc1.proofAccessInfo", label: "Accès preuve", fieldType: "STRING", required: false },
      { fieldKey: "dc1.capacitesViaDc2", label: "Capacités via DC2", fieldType: "CHECKBOX", required: false },
      { fieldKey: "dc1.capacitesViaDocuments", label: "Capacités via documents", fieldType: "CHECKBOX", required: false },
      { fieldKey: "mandataire.tradeName", label: "Nom du mandataire", fieldType: "STRING", required: false },
      { fieldKey: "mandataire.address", label: "Adresse du mandataire", fieldType: "STRING", required: false },
      { fieldKey: "mandataire.email", label: "Courriel du mandataire", fieldType: "STRING", required: false },
      { fieldKey: "mandataire.phone", label: "Téléphone du mandataire", fieldType: "STRING", required: false },
      { fieldKey: "mandataire.siret", label: "SIRET du mandataire", fieldType: "STRING", required: false },
    ];

    const form = new FormData();
    form.append("file", new Blob([dc1TemplateBuffer], { type: OOXML_MIME }), "dc1-template-v1.docx");
    form.append("fieldMappings", JSON.stringify(fieldMappings));
    // Mission — la génération partielle reste possible (ex. groupement non encore choisi) : jamais
    // bloquée tant que les champs vraiment absents sont honnêtement listés en `missingFields`.
    form.append("allowPartialGeneration", "true");

    const versionRes = await fetch(`${baseUrl}/api/v1/document-templates/${template.id}/versions`, { method: "POST", headers: multipartHeaders(tokenOwner), body: form });
    expect(versionRes.status).toBe(201);
    const version = (await versionRes.json()) as { id: string; discoveredPlaceholders: readonly { fieldKey: string }[] };
    expect(version.discoveredPlaceholders.length).toBe(fieldMappings.length);

    const activateRes = await fetch(`${baseUrl}/api/v1/document-templates/${template.id}/versions/${version.id}/activate`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    expect(activateRes.status).toBe(200);

    return { templateId: template.id };
  }

  /** SIRET valide (Luhn) et DISTINCT a chaque appel : `candidate_establishments` impose l'unicite
   *  `(organization_id, siret)` — regle de domaine CCV2-B — la ou le profil client tolere le
   *  doublon via `confirmDuplicate`. */
  let siretCounter = 0;
  function nextCandidateSiret(): string {
    siretCounter += 1;
    const base = `3560000000${String(siretCounter).padStart(3, "0")}`;
    const digits = base.split("").map(Number);
    let sum = 0;
    for (let index = 0; index < digits.length; index += 1) {
      const position = digits.length - index;
      const doubled = position % 2 === 0 ? (digits[index] as number) * 2 : (digits[index] as number);
      sum += doubled > 9 ? doubled - 9 : doubled;
    }
    return `${base}${(10 - (sum % 10)) % 10}`;
  }

  async function createClientTenderAndCandidate(input: { tradeName: string; siret: string }): Promise<{ clientAccountId: string; tenderId: string; candidateSiret: string; candidateCompanyId: string }> {
    const suffix = randomUUID();
    const candidateSiret = nextCandidateSiret();
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgId, name: `Client DC1 ${suffix}`, nameNormalized: `client dc1 ${suffix}`, status: "ACTIVE", createdBy: contributorUserId },
    });
    // Checkpoint TENDEROS-2.1-CCV2-G.2 — le DC1 tire désormais son identité EXCLUSIVEMENT de
    // l'entreprise candidate. Le profil du client reste renseigné ci-dessous à l'identique : c'est
    // précisément ce qui rend ces tests probants — les MEMES valeurs existent des deux côtés, et le
    // formulaire doit servir celles du CANDIDAT.
    const candidateCompany = await prisma.candidateCompany.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        name: input.tradeName,
        nameNormalized: `${input.tradeName.toLowerCase()} ${suffix}`,
        legalName: input.tradeName,
        siren: input.siret.slice(0, 9),
        status: "ACTIVE",
        createdBy: contributorUserId,
      },
    });
    await prisma.candidateEstablishment.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        candidateCompanyId: candidateCompany.id,
        siret: candidateSiret,
        isPrincipal: true,
        addressLine: "12 rue de la République",
        postalCode: "75001",
        city: "Paris",
        createdBy: contributorUserId,
      },
    });
    await prisma.companyRepresentative.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        candidateCompanyId: candidateCompany.id,
        firstName: "Contact",
        lastName: "Administratif",
        type: "ADMINISTRATIVE_CONTACT",
        email: "contact@example.test",
        phone: "0123456789",
        status: "ACTIVE",
        createdBy: contributorUserId,
      },
    });

    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: orgId, clientAccountId: clientAccount.id, candidateCompanyId: candidateCompany.id, title: "Marche DC1 - renovation", buyerName: "Commune de Test — Direction des Achats", status: "DRAFT", tags: [], createdBy: contributorUserId },
    });

    // Checkpoint TENDEROS-2.1-CCV2-I.1 — identité juridique du CLIENT amorcée DIRECTEMENT en base.
    // `PATCH /clients/:id/legal-identity` est retiré (409 `CLIENT_BIDDER_WRITE_RETIRED`), mais cette
    // ligne doit continuer d'exister : c'est le LEURRE dont ces tests prouvent qu'il n'est JAMAIS lu
    // à la place de l'entreprise candidate. La supprimer affaiblirait la preuve au lieu de l'adapter.
    await prisma.companyLegalIdentity.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        clientAccountId: clientAccount.id,
        legalName: input.tradeName,
        tradeName: input.tradeName,
        siren: input.siret.slice(0, 9),
        siretPrincipal: input.siret,
        addressLine: "12 rue de la République",
        postalCode: "75001",
        city: "Paris",
        phone: "0123456789",
        generalEmail: "contact@example.test",
        createdBy: contributorUserId,
      },
    });

    const ensureDc1Res = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/administrative-dc1`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    expect(ensureDc1Res.status).toBe(200);
    const dc1 = (await ensureDc1Res.json()) as { id: string };
    const updateDc1Res = await fetch(`${baseUrl}/api/v1/administrative-dc1-declarations/${dc1.id}`, { method: "PATCH", headers: jsonHeaders(tokenOwner), body: JSON.stringify({ exclusionAttestation: true }) });
    expect(updateDc1Res.status).toBe(200);

    return { clientAccountId: clientAccount.id, tenderId: tender.id, candidateSiret, candidateCompanyId: candidateCompany.id };
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

    await prisma.organization.create({ data: { id: orgId, name: "DC1 Fill Org", slug: `dc1-fill-org-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    // Checkpoint TENDEROS-2.1-P2.3-E1.3 — EnsureAdministrativeDossierUseCase/CreateAdministrativeRequirementUseCase
    // gatent désormais canOperateOnTender : ENTERPRISE (illimité) évite tout effet de bord de
    // quota/AO credits, même motif déjà établi dans
    // dce-http.integration.spec.ts/analysis-http.integration.spec.ts.
    await prisma.organizationSubscription.create({
      data: { id: randomUUID(), organizationId: orgId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
    });

    const owner = await registerAndLogin(`dc1-fill-owner-${randomUUID()}@smoke.test`);
    const contributor = await registerAndLogin(`dc1-fill-contributor-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId, contributor.userId);
    tokenOwner = owner.token;
    tokenContributor = contributor.token;
    contributorUserId = contributor.userId;

    await addMembership({ userId: owner.userId, role: OrganizationRole.Owner });
    await addMembership({ userId: contributor.userId, role: OrganizationRole.Contributor });

    // Le gabarit DC1 est une ressource SYSTEM stable par organisation (mission — "chaque
    // organisation importe une fois le gabarit réel"), jamais recréée par test individuel.
    await seedActiveDc1Template();
  }, 60000);

  afterAll(async () => {
    await prisma.generatedDocumentRevision.deleteMany({ where: { organizationId: orgId } });
    await prisma.generatedDocument.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentTemplateFieldMapping.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentTemplateVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentTemplate.deleteMany({ where: { organizationId: orgId } });
    await prisma.dc1Declaration.deleteMany({ where: { organizationId: orgId } });
    await prisma.administrativeDossier.deleteMany({ where: { organizationId: orgId } });
    await prisma.companyLegalIdentity.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.document.deleteMany({ where: { organizationId: orgId } });
    await prisma.tender.deleteMany({ where: { organizationId: orgId } });
    // AVANT `candidateCompany` : le helper cree desormais aussi un representant candidate.
    await prisma.companyRepresentative.deleteMany({ where: { organizationId: orgId } });
    await prisma.candidateEstablishment.deleteMany({ where: { organizationId: orgId } });
    await prisma.candidateCompany.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  it("readiness reflects real business data honestly — no invented values, no side effect", async () => {
    const { tenderId, candidateSiret } = await createClientTenderAndCandidate({ tradeName: "Établissements Béranger & Cie", siret: "35600000000048" });

    const countBefore = await prisma.generatedDocument.count({ where: { organizationId: orgId } });

    const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/official-forms/dc1/readiness`, { headers: jsonHeaders(tokenOwner) });
    expect(readinessRes.status).toBe(200);
    const readiness = (await readinessRes.json()) as {
      applicableFieldCount: number;
      availableFieldCount: number;
      missingFieldKeys: string[];
      needsReviewFieldKeys: string[];
      fields: { fieldKey: string; status: string; value?: unknown }[];
    };

    // Champs INDIVIDUAL réellement disponibles depuis de vraies données métier.
    expect(readiness.fields.find((f) => f.fieldKey === "candidate.tradeName")).toMatchObject({ status: "AVAILABLE", value: "Établissements Béranger & Cie" });
    // Le SIRET vient desormais de l'ETABLISSEMENT PRINCIPAL du candidat, jamais du profil client.
    expect(readiness.fields.find((f) => f.fieldKey === "candidate.siret")).toMatchObject({ status: "AVAILABLE", value: candidateSiret });
    expect(readiness.fields.find((f) => f.fieldKey === "dc1.exclusionAttestation")).toMatchObject({ status: "AVAILABLE", value: true });
    expect(readiness.fields.find((f) => f.fieldKey === "dc1.candidatSeul")).toMatchObject({ status: "AVAILABLE", value: true });

    // Groupement/mandataire ne s'appliquent jamais à un candidat individuel — jamais un statut
    // MISSING trompeur pour un champ hors-sujet.
    expect(readiness.fields.find((f) => f.fieldKey === "dc1.members")).toMatchObject({ status: "NOT_APPLICABLE" });
    expect(readiness.fields.find((f) => f.fieldKey === "mandataire.tradeName")).toMatchObject({ status: "NOT_APPLICABLE" });

    // Choix de périmètre (lot) : jamais deviné, un humain doit trancher au lancement.
    expect(readiness.needsReviewFieldKeys).toEqual(expect.arrayContaining(["dc1.scopeMarcheUnique", "dc1.scopeTousLots", "dc1.scopeLotSpecifique", "dc1.lotNumeros"]));

    // Aucune source TenderOS pour la preuve d'accès externe — jamais inventé.
    expect(readiness.missingFieldKeys).toEqual(expect.arrayContaining(["dc1.proofUrl", "dc1.proofAccessInfo"]));

    expect(readiness.applicableFieldCount).toBe(18);
    expect(readiness.availableFieldCount).toBe(12);

    // La consultation seule (readiness) ne crée JAMAIS de `GeneratedDocument` — mission §35 "voir
    // sans générer".
    const countAfter = await prisma.generatedDocument.count({ where: { organizationId: orgId } });
    expect(countAfter).toBe(countBefore);
  });

  it("generates a REAL DC1 DOCX containing the real business data — only on explicit request", async () => {
    const { tenderId } = await createClientTenderAndCandidate({ tradeName: "Menuiserie Lefort SARL", siret: "35600000000048" });

    const generateRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/official-forms/dc1/generate`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    expect(generateRes.status).toBe(201);
    const generated = (await generateRes.json()) as { id: string; tenderId: string; revisions: { id: string; revisionNumber: number; status: string; artifactDocumentId?: string }[] };
    expect(generated.tenderId).toBe(tenderId);
    expect(generated.revisions).toHaveLength(1);
    expect(generated.revisions[0]!.status).toBe("COMPLETED");
    expect(generated.revisions[0]!.artifactDocumentId).toBeDefined();

    const downloadRes = await fetch(`${baseUrl}/api/v1/documents/${generated.revisions[0]!.artifactDocumentId}/download`, { headers: jsonHeaders(tokenOwner) });
    expect(downloadRes.status).toBe(200);
    const buffer = Buffer.from(await downloadRes.arrayBuffer());
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(documentXml).toBeDefined();
    expect(documentXml).toContain("Menuiserie Lefort SARL");
    expect(documentXml).toContain("Marche DC1");
  });

  it("BLOCKING (mission §58/§39 history) — generating twice for the SAME tender appends revision #2 to the SAME lineage, never creates a second independent lineage, and R1's snapshot stays frozen", async () => {
    const { tenderId, candidateCompanyId } = await createClientTenderAndCandidate({ tradeName: "Couverture Marchand SAS", siret: "35600000000048" });

    const firstRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/official-forms/dc1/generate`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    expect(firstRes.status).toBe(201);
    const first = (await firstRes.json()) as { id: string; revisions: { revisionNumber: number }[] };
    expect(first.revisions.map((r) => r.revisionNumber)).toEqual([1]);

    // La fiche source change ENTRE les deux générations — R1 doit rester figé sur l'ancien nom.
    //
    // Checkpoint TENDEROS-2.1-CCV2-G.2 — la SOURCE mutée est désormais l'ENTREPRISE CANDIDATE, via
    // sa route native (CCV2-F.2), et non plus le profil du client commercial. L'intention du test
    // est rigoureusement conservée : une révision figée, une révision à jour. Ce qui change, c'est
    // l'entité dont l'identité fait autorité pour un formulaire officiel.
    const updateRes = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateCompanyId}`, {
      method: "PATCH",
      headers: jsonHeaders(tokenOwner),
      body: JSON.stringify({ legalName: "Couverture Marchand SAS (renommee)" }),
    });
    expect(updateRes.status).toBe(200);

    const secondRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/official-forms/dc1/generate`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    expect(secondRes.status).toBe(201);
    const second = (await secondRes.json()) as { id: string; revisions: { revisionNumber: number; artifactDocumentId?: string }[] };

    // Même lignée (même `GeneratedDocument.id`), jamais une seconde lignée indépendante.
    expect(second.id).toBe(first.id);
    expect(second.revisions.map((r) => r.revisionNumber).sort()).toEqual([1, 2]);

    const lineageCount = await prisma.generatedDocument.count({ where: { organizationId: orgId, tenderId } });
    expect(lineageCount).toBe(1);

    const revision1 = second.revisions.find((r) => r.revisionNumber === 1)!;
    const revision2 = second.revisions.find((r) => r.revisionNumber === 2)!;
    const download1 = await fetch(`${baseUrl}/api/v1/documents/${revision1.artifactDocumentId}/download`, { headers: jsonHeaders(tokenOwner) });
    const zip1 = await JSZip.loadAsync(Buffer.from(await download1.arrayBuffer()));
    const xml1 = await zip1.file("word/document.xml")?.async("string");
    expect(xml1).toContain("Couverture Marchand SAS");
    expect(xml1).not.toContain("renommee");

    const download2 = await fetch(`${baseUrl}/api/v1/documents/${revision2.artifactDocumentId}/download`, { headers: jsonHeaders(tokenOwner) });
    const zip2 = await JSZip.loadAsync(Buffer.from(await download2.arrayBuffer()));
    const xml2 = await zip2.file("word/document.xml")?.async("string");
    expect(xml2).toContain("renommee");
  }, 15000); // Checkpoint 2.1-A4 — deux générations DOCX réelles + un PATCH + deux téléchargements
  // dans un seul test ; déjà proche du timeout par défaut (5000ms) avant A4, désormais dépassé par
  // l'appel best-effort supplémentaire à ResolveCandidateIdentityUseCase dans les résolveurs DC1/
  // DC2/DC4 (une lecture Prisma en plus par génération, jamais un N+1 — mission §71).

  it("BLOCKING (correctif audit Codex P2 — concurrence) — two simultaneous first-time generate calls on the SAME tender never create two independent lineages", async () => {
    const { tenderId } = await createClientTenderAndCandidate({ tradeName: "Toiture Bernard SARL", siret: "35600000000048" });

    const [resA, resB] = await Promise.all([
      fetch(`${baseUrl}/api/v1/tenders/${tenderId}/official-forms/dc1/generate`, { method: "POST", headers: jsonHeaders(tokenOwner) }),
      fetch(`${baseUrl}/api/v1/tenders/${tenderId}/official-forms/dc1/generate`, { method: "POST", headers: jsonHeaders(tokenOwner) }),
    ]);
    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    const bodyA = (await resA.json()) as { id: string };
    const bodyB = (await resB.json()) as { id: string };

    expect(bodyA.id).toBe(bodyB.id);
    const lineageCount = await prisma.generatedDocument.count({ where: { organizationId: orgId, tenderId } });
    expect(lineageCount).toBe(1);
    const revisions = await prisma.generatedDocumentRevision.findMany({ where: { organizationId: orgId, generatedDocumentId: bodyA.id }, orderBy: { revisionNumber: "asc" } });
    expect(revisions.map((r) => r.revisionNumber)).toEqual([1, 2]);
  });

  it("BLOCKING (audit post-A4, correctif P2-01) — a Tender linked to a CandidateCompany resolves candidate.tradeName/siret/address from CandidateCompany, NEVER from the ClientAccount's legal identity, even when they differ", async () => {
    const { clientAccountId, tenderId } = await createClientTenderAndCandidate({ tradeName: "Client Legacy Legal SARL", siret: "35600000000048" });

    const candidateCompany = await prisma.candidateCompany.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        name: "Candidate Moderne SAS",
        nameNormalized: "candidate moderne sas",
        legalName: "Candidate Moderne SAS",
        siren: "789000000",
        status: "ACTIVE",
        createdBy: contributorUserId,
      },
    });
    await prisma.candidateEstablishment.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        candidateCompanyId: candidateCompany.id,
        siret: "78900000000029",
        isPrincipal: true,
        addressLine: "9 avenue du Candidat",
        postalCode: "69000",
        city: "Lyon",
        country: "FR",
        createdBy: contributorUserId,
      },
    });
    await prisma.tender.update({ where: { id_organizationId: { id: tenderId, organizationId: orgId } }, data: { candidateCompanyId: candidateCompany.id } });

    const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/official-forms/dc1/readiness`, { headers: jsonHeaders(tokenOwner) });
    expect(readinessRes.status).toBe(200);
    const readiness = (await readinessRes.json()) as { fields: { fieldKey: string; status: string; value?: unknown }[] };
    expect(readiness.fields.find((f) => f.fieldKey === "candidate.tradeName")).toMatchObject({ status: "AVAILABLE", value: "Candidate Moderne SAS" });
    expect(readiness.fields.find((f) => f.fieldKey === "candidate.siret")).toMatchObject({ status: "AVAILABLE", value: "78900000000029" });
    expect(readiness.fields.find((f) => f.fieldKey === "candidate.address")?.value).toContain("9 avenue du Candidat");
    // Checkpoint TENDEROS-2.1-P2.2-F3.1 (correctif audit Codex P1) — email/phone n'existent pas sur
    // CandidateCompany et aucune autre SOT candidate-native n'existe : contrairement à
    // tradeName/siret/address, ils ne retombent PLUS sur la fiche legalIdentity du ClientAccount (le
    // client commercial, jamais le candidat) en NEW FLOW — restent honnêtement MISSING plutôt que
    // d'emprunter silencieusement une identité fausse.
    expect(readiness.fields.find((f) => f.fieldKey === "candidate.email")).toMatchObject({ status: "MISSING" });

    const generateRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/official-forms/dc1/generate`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    expect(generateRes.status).toBe(201);
    const generated = (await generateRes.json()) as { revisions: { artifactDocumentId?: string }[] };
    const downloadRes = await fetch(`${baseUrl}/api/v1/documents/${generated.revisions[0]!.artifactDocumentId}/download`, { headers: jsonHeaders(tokenOwner) });
    const zip = await JSZip.loadAsync(Buffer.from(await downloadRes.arrayBuffer()));
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(documentXml).toContain("Candidate Moderne SAS");
    expect(documentXml).not.toContain("Client Legacy Legal SARL");

    void clientAccountId;
  });

  it("BLOCKING — a contributor without a client assignment on this Tender's client cannot read or generate the DC1 form (never leaks existence — 404, same convention as document-generation's own cross-client tests)", async () => {
    const { clientAccountId, tenderId } = await createClientTenderAndCandidate({ tradeName: "Isolation SAS", siret: "35600000000048" });
    void clientAccountId;

    const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/official-forms/dc1/readiness`, { headers: jsonHeaders(tokenContributor) });
    expect(readinessRes.status).toBe(404);

    const generateRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/official-forms/dc1/generate`, { method: "POST", headers: jsonHeaders(tokenContributor) });
    expect(generateRes.status).toBe(404);
  });
});
