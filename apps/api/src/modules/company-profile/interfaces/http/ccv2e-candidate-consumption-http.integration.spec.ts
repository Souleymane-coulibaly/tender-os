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
import { ResolveCandidateCapabilitiesUseCase } from "../../application/use-cases/resolve-candidate-capabilities.use-case";
import { backfillDocumentsToCandidate } from "../../../candidate-company/migration/backfill-documents-to-candidate";

/**
 * Checkpoint TENDEROS-2.1-CCV2-E — preuve par CONTRASTE de la consommation candidate.
 *
 * Chaque sentinelle est unique et n'existe qu'à un seul endroit de la base. Toute assertion se fait
 * DANS LES DEUX SENS : témoin positif (la donnée du bon candidat EST là) et témoin négatif (celle
 * de l'autre candidat n'y est JAMAIS). Un test qui ne prouverait que l'absence pourrait réussir en
 * ne remontant rien du tout — c'est précisément le piège que la paire évite.
 */
describe("CCV2-E — consommation CandidateCompany (HTTP + PostgreSQL réels)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let membershipRepository: PrismaMembershipRepository;
  let resolveCapabilities: ResolveCandidateCapabilitiesUseCase;

  const orgA = randomUUID();
  const orgB = randomUUID();
  const userIds: string[] = [];

  let tokenA: string;
  let userA: string;
  let tokenB: string;

  let clientX: string;
  let candidateA: string;
  let candidateB: string;
  let candidateInOrgB: string;

  const CERT_A = "CERTIFICATION-GONO-A-98765";
  const CERT_B = "CERTIFICATION-GONO-B-98765";
  const REF_A = "REFERENCE_A_ONLY_98765";
  const REF_B = "REFERENCE_B_ONLY_98765";
  const LIB_A = "LIBRARY_SECRET_CANDIDATE_A_78421";
  const LIB_B = "LIBRARY_SECRET_CANDIDATE_B_78421";
  const IBAN_A = "FR7630006000011234567890189";

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const r = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "CCV2-E", termsAccepted: true }),
    });
    const user = (await r.json()) as { id: string };
    const l = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return { userId: user.id, token: ((await l.json()) as { accessToken: string }).accessToken };
  }

  function headers(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  async function createCandidate(organizationId: string, token: string, name: string): Promise<string> {
    const res = await fetch(`${baseUrl}/api/v1/candidate-companies`, { method: "POST", headers: headers(token, organizationId), body: JSON.stringify({ name }) });
    return ((await res.json()) as { id: string }).id;
  }

  /** Sème les capacités par les VRAIES routes CCV2-C/C.1/D — jamais par insertion directe. */
  async function seedCapabilities(candidateCompanyId: string, marker: { cert: string; reference: string; library: string }): Promise<void> {
    const h = headers(tokenA, orgA);
    const base = `${baseUrl}/api/v1/candidate-companies/${candidateCompanyId}`;
    await fetch(`${base}/certifications`, { method: "POST", headers: h, body: JSON.stringify({ name: marker.cert, issuer: "AFNOR" }) });
    await fetch(`${base}/references`, { method: "POST", headers: h, body: JSON.stringify({ projectName: marker.reference, sector: "BTP" }) });
    await fetch(`${base}/insurances`, { method: "POST", headers: h, body: JSON.stringify({ type: "PROFESSIONAL_LIABILITY", insurer: `ASSUREUR-${marker.cert}` }) });

    const form = new FormData();
    form.append("file", new Blob([Buffer.from(`%PDF-1.4 ${marker.library}\n%%EOF\n`)], { type: "application/pdf" }), `${marker.library}.pdf`);
    form.append("title", marker.library);
    form.append("domain", "ORGANIZATION");
    form.append("origin", "USER_UPLOAD");
    const uploaded = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}`, "X-Organization-Id": orgA }, body: form });
    const documentId = ((await uploaded.json()) as { id: string }).id;
    await fetch(`${base}/documents`, { method: "POST", headers: h, body: JSON.stringify({ documentId, category: "KBIS", label: marker.library }) });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    prisma = moduleRef.get(PrismaService);
    membershipRepository = new PrismaMembershipRepository(prisma);
    resolveCapabilities = moduleRef.get(ResolveCandidateCapabilitiesUseCase);

    await prisma.organization.create({ data: { id: orgA, name: "E A", slug: `e-a-${orgA}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    await prisma.organization.create({ data: { id: orgB, name: "E B", slug: `e-b-${orgB}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const a = await registerAndLogin(`e-a-${randomUUID()}@smoke.test`);
    userIds.push(a.userId);
    tokenA = a.token;
    userA = a.userId;
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgA, userId: userA, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    const b = await registerAndLogin(`e-b-${randomUUID()}@smoke.test`);
    userIds.push(b.userId);
    tokenB = b.token;
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgB, userId: b.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    // Un CLIENT commercial porteur de données PIÈGES : rien de tout ceci ne doit jamais remonter
    // dans un flux candidate.
    clientX = randomUUID();
    await prisma.clientAccount.create({
      data: { id: clientX, organizationId: orgA, name: "Client X", nameNormalized: `client-x-${clientX}`, status: "ACTIVE", createdBy: userA },
    });
    await prisma.companyCertification.create({ data: { organizationId: orgA, clientAccountId: clientX, name: "CERTIFICATION-CLIENT-X-PIEGE", createdBy: userA } });
    await prisma.companyReference.create({ data: { organizationId: orgA, clientAccountId: clientX, projectName: "REFERENCE-CLIENT-X-PIEGE", createdBy: userA } });

    candidateA = await createCandidate(orgA, tokenA, `Candidat A ${randomUUID()}`);
    candidateB = await createCandidate(orgA, tokenA, `Candidat B ${randomUUID()}`);
    candidateInOrgB = await createCandidate(orgB, tokenB, `Candidat orgB ${randomUUID()}`);

    await seedCapabilities(candidateA, { cert: CERT_A, reference: REF_A, library: LIB_A });
    await seedCapabilities(candidateB, { cert: CERT_B, reference: REF_B, library: LIB_B });

    // Banking sur A uniquement — il ne doit apparaître dans AUCUN contexte de capacités.
    await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateA}/bank-accounts`, {
      method: "POST",
      headers: headers(tokenA, orgA),
      body: JSON.stringify({ accountHolder: "A SAS", iban: IBAN_A }),
    });
  }, 240000);

  afterAll(async () => {
    for (const organizationId of [orgA, orgB]) {
      await prisma.documentCandidateCompanyAssociation.deleteMany({ where: { organizationId } });
      await prisma.companyBankAccount.deleteMany({ where: { organizationId } });
      await prisma.companyCertification.deleteMany({ where: { organizationId } });
      await prisma.companyInsurance.deleteMany({ where: { organizationId } });
      await prisma.companyReference.deleteMany({ where: { organizationId } });
      await prisma.companyRepresentative.deleteMany({ where: { organizationId } });
      await prisma.documentVersion.deleteMany({ where: { organizationId } });
      await prisma.document.deleteMany({ where: { organizationId } });
      await prisma.candidateCompany.deleteMany({ where: { organizationId } });
      await prisma.clientAccount.deleteMany({ where: { organizationId } });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
      await prisma.outboxEvent.deleteMany({ where: { organizationId } });
      await prisma.membershipRole.deleteMany({ where: { membership: { organizationId } } });
      await prisma.organizationMembership.deleteMany({ where: { organizationId } });
    }
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await app.close();
  }, 60000);

  describe("Résolveur canonique — contraste A/B", () => {
    it("chaque candidat ne voit QUE ses propres capacités, et jamais celles du client commercial", async () => {
      const a = await resolveCapabilities.execute({ organizationId: orgA, candidateCompanyId: candidateA });
      const b = await resolveCapabilities.execute({ organizationId: orgA, candidateCompanyId: candidateB });

      const serializedA = JSON.stringify(a);
      const serializedB = JSON.stringify(b);

      // Témoins POSITIFS — sans eux, les témoins négatifs seraient satisfaits par un contexte vide.
      expect(serializedA).toContain(CERT_A);
      expect(serializedA).toContain(REF_A);
      expect(serializedA).toContain(LIB_A);
      expect(serializedB).toContain(CERT_B);
      expect(serializedB).toContain(REF_B);
      expect(serializedB).toContain(LIB_B);

      // Témoins NÉGATIFS — aucune contamination, dans les deux sens.
      expect(serializedA).not.toContain(CERT_B);
      expect(serializedA).not.toContain(REF_B);
      expect(serializedA).not.toContain(LIB_B);
      expect(serializedB).not.toContain(CERT_A);
      expect(serializedB).not.toContain(REF_A);
      expect(serializedB).not.toContain(LIB_A);

      // Le CLIENT commercial de l'organisation n'apparaît jamais, bien qu'il porte des données.
      for (const serialized of [serializedA, serializedB]) {
        expect(serialized).not.toContain("CERTIFICATION-CLIENT-X-PIEGE");
        expect(serialized).not.toContain("REFERENCE-CLIENT-X-PIEGE");
      }
    }, 90000);

    it("AUCUN FALLBACK — un candidat sans capacité renvoie des collections vides, jamais le profil du client", async () => {
      const vierge = await createCandidate(orgA, tokenA, `Vierge ${randomUUID()}`);
      const resolved = await resolveCapabilities.execute({ organizationId: orgA, candidateCompanyId: vierge });

      expect(resolved.source).toBe("CANDIDATE_COMPANY");
      expect(resolved.certifications).toEqual([]);
      expect(resolved.references).toEqual([]);
      expect(resolved.documents).toEqual([]);
      expect(JSON.stringify(resolved)).not.toContain("CLIENT-X");
    }, 60000);

    it("appelé SANS candidat (flux Legacy), il ne va jamais chercher quoi que ce soit", async () => {
      const resolved = await resolveCapabilities.execute({ organizationId: orgA, candidateCompanyId: undefined });
      expect(resolved.source).toBe("NONE");
      expect(resolved.certifications).toEqual([]);
      expect(resolved.documents).toEqual([]);
    }, 30000);
  });

  describe("BANKING — aucune fuite dans les contextes de consommation", () => {
    it("l'IBAN du candidat A n'apparaît dans AUCUN contexte de capacités, alors qu'il existe bien en base", async () => {
      expect(await prisma.companyBankAccount.count({ where: { organizationId: orgA, candidateCompanyId: candidateA } })).toBe(1);

      const a = await resolveCapabilities.execute({ organizationId: orgA, candidateCompanyId: candidateA });
      const serialized = JSON.stringify(a);
      expect(serialized).not.toContain(IBAN_A);
      expect(serialized.toLowerCase()).not.toContain("iban");
      // La pièce bancaire est exclue par construction, jamais filtrée après coup par un appelant.
      expect(a.documents.every((document) => document.category !== "BANK_DETAILS")).toBe(true);
    }, 60000);
  });

  describe("ISOLATION TENANT", () => {
    it("le résolveur ne franchit jamais la frontière d'organisation, même avec un id valide", async () => {
      // Candidat d'orgB demandé avec le contexte d'orgA : aucune capacité ne remonte.
      const crossed = await resolveCapabilities.execute({ organizationId: orgA, candidateCompanyId: candidateInOrgB });
      expect(crossed.certifications).toEqual([]);
      expect(crossed.references).toEqual([]);
      expect(crossed.documents).toEqual([]);

      // Et l'inverse : le candidat A n'est pas atteignable depuis orgB.
      const reverse = await resolveCapabilities.execute({ organizationId: orgB, candidateCompanyId: candidateA });
      expect(JSON.stringify(reverse)).not.toContain(CERT_A);
      expect(JSON.stringify(reverse)).not.toContain(LIB_A);
    }, 60000);

    it("orgB ne peut lire ni les capacités ni les documents du candidat A par HTTP — 404, jamais 403", async () => {
      for (const suffix of ["certifications", "references", "documents", "bank-accounts"]) {
        const own = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateA}/${suffix}`, { headers: headers(tokenB, orgB) });
        expect(own.status).toBe(404);
        const forged = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateA}/${suffix}`, { headers: headers(tokenB, orgA) });
        expect(forged.status).toBe(404);
        expect(((await forged.json()) as { error: { code: string } }).error.code).toBe("ORGANIZATION_ACCESS_DENIED");
      }
    }, 120000);
  });

  describe("EXPIRATION — un justificatif périmé ne satisfait pas une exigence courante", () => {
    it("une certification expirée est remontée avec le statut EXPIRED, jamais comme valide", async () => {
      const expiring = await createCandidate(orgA, tokenA, `Expiration ${randomUUID()}`);
      const h = headers(tokenA, orgA);
      await fetch(`${baseUrl}/api/v1/candidate-companies/${expiring}/certifications`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ name: "CERT-PERIMEE", expiresAt: "2020-01-01T00:00:00.000Z" }),
      });
      await fetch(`${baseUrl}/api/v1/candidate-companies/${expiring}/certifications`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ name: "CERT-VALIDE", expiresAt: "2030-01-01T00:00:00.000Z" }),
      });

      const resolved = await resolveCapabilities.execute({ organizationId: orgA, candidateCompanyId: expiring });
      const expired = resolved.certifications.find((certification) => certification.name === "CERT-PERIMEE");
      const valid = resolved.certifications.find((certification) => certification.name === "CERT-VALIDE");
      expect(expired?.temporalStatus).toBe("EXPIRED");
      expect(valid?.temporalStatus).toBe("VALID");
    }, 90000);
  });

  describe("ARCHIVAGE — une capacité archivée cesse d'alimenter les consommateurs", () => {
    it("archiver une certification la retire du contexte, sans jamais détruire la ligne", async () => {
      const archiving = await createCandidate(orgA, tokenA, `Archivage ${randomUUID()}`);
      const h = headers(tokenA, orgA);
      const created = await fetch(`${baseUrl}/api/v1/candidate-companies/${archiving}/certifications`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ name: "CERT-A-ARCHIVER" }),
      });
      const id = ((await created.json()) as { id: string }).id;

      expect(JSON.stringify(await resolveCapabilities.execute({ organizationId: orgA, candidateCompanyId: archiving }))).toContain("CERT-A-ARCHIVER");

      await fetch(`${baseUrl}/api/v1/candidate-companies/${archiving}/certifications/${id}`, { method: "DELETE", headers: h });

      expect(JSON.stringify(await resolveCapabilities.execute({ organizationId: orgA, candidateCompanyId: archiving }))).not.toContain("CERT-A-ARCHIVER");
      // La ligne existe toujours : archivage logique, jamais suppression physique.
      expect(await prisma.companyCertification.findUnique({ where: { id } })).not.toBeNull();
    }, 90000);
  });

  describe("CCV2-E.1 — un document Legacy backfillé devient consommable par le NEW FLOW", () => {
    it("après backfill, le résolveur candidate le retrouve ; un AUTRE candidat ne l'obtient jamais", async () => {
      // 1. État Legacy : un document rattaché au ClientAccount X, comme avant CCV2.
      const form = new FormData();
      form.append("file", new Blob([Buffer.from("%PDF-1.4 LEGACY-BACKFILL-98765")], { type: "application/pdf" }), "kbis-legacy.pdf");
      form.append("title", "KBIS-LEGACY-BACKFILL-98765");
      form.append("domain", "ORGANIZATION");
      form.append("origin", "USER_UPLOAD");
      const uploaded = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}`, "X-Organization-Id": orgA }, body: form });
      const documentId = ((await uploaded.json()) as { id: string }).id;
      await prisma.documentClientAccountAssociation.create({
        data: { organizationId: orgA, documentId, clientAccountId: clientX, category: "KBIS", createdByUserId: userA },
      });

      // 2. Le ClientAccount X devient l'origine d'une CandidateCompany (promotion assistée).
      const promu = randomUUID();
      await prisma.candidateCompany.create({
        data: { id: promu, organizationId: orgA, name: `Promu ${promu}`, nameNormalized: `promu-${promu}`, status: "ACTIVE", createdBy: userA, sourceClientAccountId: clientX },
      });

      // AVANT backfill : le NEW FLOW ne voit rien — aucun fallback silencieux vers le ClientAccount.
      const before = await resolveCapabilities.execute({ organizationId: orgA, candidateCompanyId: promu });
      expect(before.documents).toEqual([]);

      // 3. Backfill.
      const report = await backfillDocumentsToCandidate(prisma, { organizationId: orgA });
      expect(report.associationsCreated).toBeGreaterThanOrEqual(1);

      // 4. APRÈS backfill : le NEW FLOW le retrouve via CandidateCompany, sans ClientAccount.
      const after = await resolveCapabilities.execute({ organizationId: orgA, candidateCompanyId: promu });
      expect(after.documents.map((document) => document.documentId)).toContain(documentId);

      // 5. Un AUTRE candidat de la même organisation ne l'obtient jamais.
      const otherCandidate = await resolveCapabilities.execute({ organizationId: orgA, candidateCompanyId: candidateB });
      expect(otherCandidate.documents.map((document) => document.documentId)).not.toContain(documentId);

      // 6. Le chemin Legacy voit toujours exactement la même ligne : aucune perte, aucune copie.
      expect(await prisma.documentClientAccountAssociation.count({ where: { documentId } })).toBe(1);
      expect(await prisma.document.count({ where: { id: documentId } })).toBe(1);
    }, 180000);
  });
});
