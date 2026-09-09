import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { backfillDocumentsToCandidate, mapLegacyDocumentCategory } from "./backfill-documents-to-candidate";

/**
 * Checkpoint TENDEROS-2.1-CCV2-E.1 — preuves PostgreSQL réelles de la réconciliation des documents
 * d'entreprise Legacy avec `CandidateCompany`.
 */
describe("CCV2-E.1 — backfill documentaire Legacy → CandidateCompany (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const client = prisma as unknown as PrismaClient;

  let orgA: string;
  let orgB: string;
  let actor: string;
  let clientMigrated: string;
  let clientOrphan: string;
  let candidateMigrated: string;
  let candidateInOrgB: string;

  async function createOrganization(name: string): Promise<string> {
    const id = randomUUID();
    await client.organization.create({ data: { id, name, slug: `${name}-${id}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    return id;
  }

  async function createClientAccount(organizationId: string, name: string): Promise<string> {
    const id = randomUUID();
    await client.clientAccount.create({ data: { id, organizationId, name, nameNormalized: `${name}-${id}`, status: "ACTIVE", createdBy: actor } });
    return id;
  }

  async function createCandidate(organizationId: string, name: string, sourceClientAccountId: string | null): Promise<string> {
    const id = randomUUID();
    await client.candidateCompany.create({
      data: { id, organizationId, name, nameNormalized: `${name}-${id}`, status: "ACTIVE", createdBy: actor, sourceClientAccountId },
    });
    return id;
  }

  /** Document RÉEL à 3 versions — le backfill ne devra ni en créer, ni en réordonner, ni en perdre. */
  async function createDocumentWithVersions(organizationId: string, title: string, versionCount = 3): Promise<{ documentId: string; versionIds: string[] }> {
    const documentId = randomUUID();
    await client.document.create({
      data: { id: documentId, organizationId, title, origin: "USER_UPLOAD", domain: "ORGANIZATION", status: "ACTIVE", createdByUserId: actor },
    });
    const versionIds: string[] = [];
    for (let versionNumber = 1; versionNumber <= versionCount; versionNumber += 1) {
      const id = randomUUID();
      await client.documentVersion.create({
        data: {
          id,
          organizationId,
          documentId,
          versionNumber,
          originalFilename: `${title}-v${versionNumber}.pdf`,
          sanitizedFilename: `${title}-v${versionNumber}.pdf`,
          mimeType: "application/pdf",
          extension: "pdf",
          sizeBytes: 100 + versionNumber,
          checksum: `${versionNumber}`.repeat(64).slice(0, 64),
          storageKey: `store/${id}`,
          uploadedByUserId: actor,
        },
      });
      versionIds.push(id);
    }
    await client.document.update({ where: { id: documentId }, data: { currentVersionId: versionIds.at(-1)!, currentVersionNumber: versionCount } });
    return { documentId, versionIds };
  }

  async function attachLegacy(organizationId: string, clientAccountId: string, documentId: string, category: string, expiresAt: Date | null = null): Promise<void> {
    await client.documentClientAccountAssociation.create({
      data: { id: randomUUID(), organizationId, documentId, clientAccountId, category, issuedAt: new Date("2024-01-15T00:00:00.000Z"), expiresAt, createdByUserId: actor },
    });
  }

  async function cleanup(): Promise<void> {
    for (const organizationId of [orgA, orgB]) {
      await client.documentCandidateCompanyAssociation.deleteMany({ where: { organizationId } });
      await client.documentClientAccountAssociation.deleteMany({ where: { organizationId } });
      await client.candidateMigrationRegisterEntry.deleteMany({ where: { organizationId } });
      await client.documentVersion.deleteMany({ where: { organizationId } });
      await client.document.deleteMany({ where: { organizationId } });
      await client.candidateCompany.deleteMany({ where: { organizationId } });
      await client.clientAccount.deleteMany({ where: { organizationId } });
      await client.organization.deleteMany({ where: { id: organizationId } });
    }
  }

  beforeEach(async () => {
    actor = randomUUID();
    orgA = await createOrganization("e1-a");
    orgB = await createOrganization("e1-b");
    clientMigrated = await createClientAccount(orgA, "client-migre");
    clientOrphan = await createClientAccount(orgA, "client-orphelin");
    candidateMigrated = await createCandidate(orgA, "candidat-migre", clientMigrated);
    candidateInOrgB = await createCandidate(orgB, "candidat-b", null);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("ATTRIBUTION & MIGRATION", () => {
    it("migre les documents d'un ClientAccount ayant EXACTEMENT une CandidateCompany, et laisse l'orphelin intact", async () => {
      const kbis = await createDocumentWithVersions(orgA, "kbis");
      const fiscal = await createDocumentWithVersions(orgA, "fiscale");
      const orphelin = await createDocumentWithVersions(orgA, "orpheline");
      await attachLegacy(orgA, clientMigrated, kbis.documentId, "KBIS");
      await attachLegacy(orgA, clientMigrated, fiscal.documentId, "TAX_CERTIFICATE");
      await attachLegacy(orgA, clientOrphan, orphelin.documentId, "SOCIAL_CERTIFICATE");

      const report = await backfillDocumentsToCandidate(client, { organizationId: orgA });

      expect(report.legacyAssociationsScanned).toBe(3);
      expect(report.associationsCreated).toBe(2);
      expect(report.exceptions).toHaveLength(1);
      expect(report.exceptions[0]?.clientAccountId).toBe(clientOrphan);
      expect(report.exceptions[0]?.reason).toBe("NO_CANDIDATE_COMPANY");
      // Par construction (UNIQUE org+source), il n'existe jamais plusieurs candidats possibles.
      expect(report.exceptions[0]?.candidateCandidates).toEqual([]);

      const migrated = await client.documentCandidateCompanyAssociation.findMany({ where: { candidateCompanyId: candidateMigrated }, orderBy: { category: "asc" } });
      expect(migrated.map((association) => association.category)).toEqual(["KBIS", "TAX_CERTIFICATE"]);
      expect(migrated.map((association) => association.documentId).sort()).toEqual([kbis.documentId, fiscal.documentId].sort());

      // Le document du client orphelin n'est jamais rattaché à un candidat inventé.
      expect(await client.documentCandidateCompanyAssociation.count({ where: { documentId: orphelin.documentId } })).toBe(0);

      await cleanup();
    }, 120000);

    it("AUCUNE COPIE BINAIRE — mêmes Document, mêmes versions, mêmes storageKey après migration", async () => {
      const kbis = await createDocumentWithVersions(orgA, "kbis", 3);
      await attachLegacy(orgA, clientMigrated, kbis.documentId, "KBIS");

      const versionsBefore = await client.documentVersion.findMany({ where: { documentId: kbis.documentId }, orderBy: { versionNumber: "asc" } });
      const documentBefore = await client.document.findUnique({ where: { id: kbis.documentId } });

      const report = await backfillDocumentsToCandidate(client, { organizationId: orgA });

      expect(report.binaryCopies).toBe(0);
      expect(report.documentsAfter).toBe(report.documentsBefore);
      expect(report.documentVersionsAfter).toBe(report.documentVersionsBefore);

      // Preuve d'IDENTITÉ, pas de recopie : lignes strictement égales, clés de stockage inchangées.
      expect(await client.documentVersion.findMany({ where: { documentId: kbis.documentId }, orderBy: { versionNumber: "asc" } })).toEqual(versionsBefore);
      expect(await client.document.findUnique({ where: { id: kbis.documentId } })).toEqual(documentBefore);
      expect(versionsBefore.map((version) => version.versionNumber)).toEqual([1, 2, 3]);

      // L'association candidate pointe vers LE MÊME documentId.
      const association = await client.documentCandidateCompanyAssociation.findFirst({ where: { candidateCompanyId: candidateMigrated } });
      expect(association?.documentId).toBe(kbis.documentId);

      await cleanup();
    }, 120000);
  });

  describe("IDEMPOTENCE", () => {
    it("trois exécutions consécutives : 0 doublon, 0 association nouvelle, 0 copie binaire", async () => {
      const kbis = await createDocumentWithVersions(orgA, "kbis");
      const orphelin = await createDocumentWithVersions(orgA, "orpheline");
      await attachLegacy(orgA, clientMigrated, kbis.documentId, "KBIS");
      await attachLegacy(orgA, clientOrphan, orphelin.documentId, "OTHER");

      const run1 = await backfillDocumentsToCandidate(client, { organizationId: orgA });
      const snapshot = await client.documentCandidateCompanyAssociation.findMany({ where: { organizationId: orgA }, orderBy: { id: "asc" } });

      const run2 = await backfillDocumentsToCandidate(client, { organizationId: orgA });
      const run3 = await backfillDocumentsToCandidate(client, { organizationId: orgA });

      expect(run1.associationsCreated).toBe(1);
      for (const run of [run2, run3]) {
        expect(run.associationsCreated).toBe(0);
        expect(run.alreadyAssociated).toBe(1);
        expect(run.binaryCopies).toBe(0);
        expect(run.exceptions).toHaveLength(1);
      }

      expect(await client.documentCandidateCompanyAssociation.findMany({ where: { organizationId: orgA }, orderBy: { id: "asc" } })).toEqual(snapshot);
      // Le registre n'accumule pas non plus.
      expect(await client.candidateMigrationRegisterEntry.count({ where: { organizationId: orgA } })).toBe(1);

      await cleanup();
    }, 150000);
  });

  describe("CATÉGORIES — aucune dégradation en OTHER", () => {
    it("les 5 catégories Legacy sont préservées à l'identique", async () => {
      const categories = ["KBIS", "TAX_CERTIFICATE", "SOCIAL_CERTIFICATE", "ARTICLES_OF_ASSOCIATION", "OTHER"];
      for (const category of categories) {
        const document = await createDocumentWithVersions(orgA, `doc-${category}`, 1);
        await attachLegacy(orgA, clientMigrated, document.documentId, category);
      }

      await backfillDocumentsToCandidate(client, { organizationId: orgA });

      const migrated = await client.documentCandidateCompanyAssociation.findMany({ where: { candidateCompanyId: candidateMigrated } });
      expect(migrated.map((association) => association.category).sort()).toEqual([...categories].sort());
      // Seul `OTHER` d'origine est `OTHER` à l'arrivée : aucune dégradation de commodité.
      expect(migrated.filter((association) => association.category === "OTHER")).toHaveLength(1);

      await cleanup();
    }, 150000);

    it("une catégorie inconnue échoue bruyamment plutôt que de dégrader en OTHER", () => {
      expect(() => mapLegacyDocumentCategory("CATEGORIE_INEXISTANTE")).toThrow(/Unmapped legacy document category/);
      expect(mapLegacyDocumentCategory("KBIS")).toBe("KBIS");
    });
  });

  describe("EXPIRATION préservée", () => {
    it("un document Legacy expiré reste expiré, à la milliseconde près, et ne redevient jamais valide", async () => {
      const expired = await createDocumentWithVersions(orgA, "expiree", 1);
      const valid = await createDocumentWithVersions(orgA, "valide", 1);
      const expiresAt = new Date("2020-06-30T12:34:56.000Z");
      await attachLegacy(orgA, clientMigrated, expired.documentId, "TAX_CERTIFICATE", expiresAt);
      await attachLegacy(orgA, clientMigrated, valid.documentId, "TAX_CERTIFICATE", new Date("2030-01-01T00:00:00.000Z"));

      await backfillDocumentsToCandidate(client, { organizationId: orgA });

      const migratedExpired = await client.documentCandidateCompanyAssociation.findFirst({ where: { documentId: expired.documentId } });
      expect(migratedExpired?.validUntil?.toISOString()).toBe(expiresAt.toISOString());
      expect(migratedExpired?.issuedAt?.toISOString()).toBe("2024-01-15T00:00:00.000Z");
      // `validFrom` et `label` n'ont aucune source Legacy : jamais inventés.
      expect(migratedExpired?.validFrom).toBeNull();
      expect(migratedExpired?.label).toBeNull();

      const migratedValid = await client.documentCandidateCompanyAssociation.findFirst({ where: { documentId: valid.documentId } });
      expect(migratedValid?.validUntil?.getUTCFullYear()).toBe(2030);

      await cleanup();
    }, 120000);
  });

  describe("TENANT ISOLATION", () => {
    it("le backfill d'orgA ne touche jamais orgB, et la base refuse un rattachement cross-organisation", async () => {
      const documentA = await createDocumentWithVersions(orgA, "doc-a", 1);
      await attachLegacy(orgA, clientMigrated, documentA.documentId, "KBIS");

      const clientB = await createClientAccount(orgB, "client-b");
      const documentB = await createDocumentWithVersions(orgB, "doc-b", 1);
      await attachLegacy(orgB, clientB, documentB.documentId, "KBIS");

      await backfillDocumentsToCandidate(client, { organizationId: orgA });

      expect(await client.documentCandidateCompanyAssociation.count({ where: { organizationId: orgB } })).toBe(0);
      expect(await client.documentCandidateCompanyAssociation.count({ where: { documentId: documentB.documentId } })).toBe(0);

      // Garantie STRUCTURELLE : la FK composite (candidate_company_id, organization_id) refuse le
      // rattachement d'un document d'orgA à une CandidateCompany d'orgB, même en écriture directe.
      await expect(
        client.documentCandidateCompanyAssociation.create({
          data: { id: randomUUID(), organizationId: orgA, documentId: documentA.documentId, candidateCompanyId: candidateInOrgB, category: "KBIS", createdByUserId: actor },
        }),
      ).rejects.toThrow();

      await cleanup();
    }, 150000);
  });

  describe("REGISTRE D'EXCEPTIONS & NON-RÉGRESSION LEGACY", () => {
    it("inscrit le ClientAccount non migrable avec un COMPTEUR, sans jamais exposer de donnée sensible", async () => {
      const first = await createDocumentWithVersions(orgA, "orph-1", 1);
      const second = await createDocumentWithVersions(orgA, "orph-2", 1);
      await attachLegacy(orgA, clientOrphan, first.documentId, "KBIS");
      await attachLegacy(orgA, clientOrphan, second.documentId, "OTHER");

      const report = await backfillDocumentsToCandidate(client, { organizationId: orgA });
      expect(report.exceptions).toHaveLength(2);

      const entry = await client.candidateMigrationRegisterEntry.findFirst({ where: { organizationId: orgA, clientAccountId: clientOrphan } });
      expect(entry?.legacyDocumentCount).toBe(2);
      expect(entry?.status).toBe("PENDING_PRODUCT_DECISION");

      // Ni titre de fichier, ni clé de stockage, ni contenu — uniquement des identifiants.
      const serialized = JSON.stringify({ entry, exceptions: report.exceptions });
      expect(serialized).not.toContain("orph-1");
      expect(serialized).not.toContain("store/");

      await cleanup();
    }, 150000);

    it("les associations Legacy sont INTACTES après migration — /clients/:id/documents continue de tout voir", async () => {
      const kbis = await createDocumentWithVersions(orgA, "kbis", 2);
      await attachLegacy(orgA, clientMigrated, kbis.documentId, "KBIS");
      const legacyBefore = await client.documentClientAccountAssociation.findMany({ where: { organizationId: orgA }, orderBy: { id: "asc" } });

      await backfillDocumentsToCandidate(client, { organizationId: orgA });

      expect(await client.documentClientAccountAssociation.findMany({ where: { organizationId: orgA }, orderBy: { id: "asc" } })).toEqual(legacyBefore);
      // Association, jamais déplacement : DEUX associations vers UN SEUL fichier.
      expect(await client.documentCandidateCompanyAssociation.count({ where: { documentId: kbis.documentId } })).toBe(1);
      expect(await client.document.count({ where: { id: kbis.documentId } })).toBe(1);

      await cleanup();
    }, 120000);
  });

  describe("BANKING", () => {
    it("le catalogue Legacy ne peut PAS produire de document bancaire : BANK_DETAILS n'y existe pas", async () => {
      const document = await createDocumentWithVersions(orgA, "rib", 1);
      // Le CHECK Legacy n'autorise que 5 catégories — `BANK_DETAILS` n'en fait pas partie.
      await expect(attachLegacy(orgA, clientMigrated, document.documentId, "BANK_DETAILS")).rejects.toThrow();

      // Aucune pièce bancaire ne peut donc entrer dans le périmètre par ce backfill : la frontière
      // `candidate:read_banking` de CCV2-C.1 reste intacte par construction, pas par filtrage.
      await backfillDocumentsToCandidate(client, { organizationId: orgA });
      expect(await client.documentCandidateCompanyAssociation.count({ where: { organizationId: orgA, category: "BANK_DETAILS" } })).toBe(0);

      await cleanup();
    }, 120000);
  });
});
