import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { backfillSatellitesToCandidate, SATELLITE_FAMILIES, type SatelliteFamily } from "./backfill-satellites-to-candidate";

/**
 * Checkpoint TENDEROS-2.1-CCV2-B — preuves PostgreSQL RÉELLES du modèle de propriété V2 :
 * intégrité de schéma, isolation tenant garantie en base, cohérence de lignage, backfill,
 * idempotence, atomicité en cas d'échec, registre des non-migrables, tradeName, association
 * documentaire et non-exposition du banking.
 */
describe("CCV2-B — propriété CandidateCompany des satellites (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const client = prisma as unknown as PrismaClient;

  let orgA: string;
  let orgB: string;
  let actor: string;
  /** orgA : client migré (a une CandidateCompany) */
  let clientMigrated: string;
  let candidateMigrated: string;
  /** orgA : client orphelin (aucune CandidateCompany) — registre */
  let clientOrphan: string;
  /** orgA : candidate native (sans sourceClientAccountId) */
  let candidateNative: string;
  /** orgB : pour les preuves cross-tenant */
  let clientInB: string;
  let candidateInB: string;

  async function createOrganization(name: string): Promise<string> {
    const id = randomUUID();
    await client.organization.create({ data: { id, name, slug: `${name}-${id}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    return id;
  }

  async function createClientAccount(organizationId: string, name: string): Promise<string> {
    const id = randomUUID();
    await client.clientAccount.create({
      data: { id, organizationId, name, nameNormalized: `${name}-${id}`.toLowerCase(), status: "ACTIVE", createdBy: actor },
    });
    return id;
  }

  async function createCandidate(organizationId: string, name: string, sourceClientAccountId: string | null): Promise<string> {
    const id = randomUUID();
    await client.candidateCompany.create({
      data: { id, organizationId, name, nameNormalized: `${name}-${id}`.toLowerCase(), status: "ACTIVE", createdBy: actor, sourceClientAccountId },
    });
    return id;
  }

  /** Une ligne de chaque famille pour un ClientAccount donné — jamais de candidateCompanyId ici :
   *  c'est exactement l'état Legacy d'avant CCV2-B. */
  async function seedLegacySatellites(organizationId: string, clientAccountId: string): Promise<void> {
    await client.companyRepresentative.create({ data: { organizationId, clientAccountId, firstName: "Ada", lastName: "Lovelace", type: "SIGNATORY", createdBy: actor } });
    await client.companyBankAccount.create({ data: { organizationId, clientAccountId, accountHolder: "Acme", iban: "FR7630006000011234567890189", bic: "AGRIFRPP", createdBy: actor } });
    await client.companyInsurance.create({ data: { organizationId, clientAccountId, type: "PROFESSIONAL_LIABILITY", insurer: "AXA", createdBy: actor } });
    await client.companyCertification.create({ data: { organizationId, clientAccountId, name: "ISO 9001", issuer: "AFNOR", createdBy: actor } });
    await client.companyReference.create({ data: { organizationId, clientAccountId, projectName: "Chantier A", createdBy: actor } });
    await client.companyHumanResource.create({ data: { organizationId, clientAccountId, category: "ENG", title: "Ingénieur", headcount: 3, createdBy: actor } });
    await client.companyMaterialResource.create({ data: { organizationId, clientAccountId, category: "ENGIN", name: "Pelleteuse", quantity: 2, createdBy: actor } });
  }

  async function ownershipCounts(organizationId: string): Promise<{ owned: Record<SatelliteFamily, number>; legacyOnly: Record<SatelliteFamily, number> }> {
    const owned = {} as Record<SatelliteFamily, number>;
    const legacyOnly = {} as Record<SatelliteFamily, number>;
    for (const family of SATELLITE_FAMILIES) {
      const d = (client as unknown as Record<SatelliteFamily, { count: (a: unknown) => Promise<number> }>)[family];
      owned[family] = await d.count({ where: { organizationId, candidateCompanyId: { not: null } } });
      legacyOnly[family] = await d.count({ where: { organizationId, candidateCompanyId: null } });
    }
    return { owned, legacyOnly };
  }

  async function cleanup(organizationIds: string[]): Promise<void> {
    for (const organizationId of organizationIds) {
      await client.documentCandidateCompanyAssociation.deleteMany({ where: { organizationId } });
      await client.candidateMigrationRegisterEntry.deleteMany({ where: { organizationId } });
      await client.companyReferenceDocument.deleteMany({ where: { organizationId } });
      for (const family of SATELLITE_FAMILIES) {
        await (client as unknown as Record<SatelliteFamily, { deleteMany: (a: unknown) => Promise<unknown> }>)[family].deleteMany({ where: { organizationId } });
      }
      await client.companyLegalIdentity.deleteMany({ where: { organizationId } });
      await client.documentVersion.deleteMany({ where: { organizationId } });
      await client.document.deleteMany({ where: { organizationId } });
      await client.candidateEstablishment.deleteMany({ where: { organizationId } });
      await client.candidateCompany.deleteMany({ where: { organizationId } });
      await client.clientAccount.deleteMany({ where: { organizationId } });
      await client.organization.deleteMany({ where: { id: organizationId } });
    }
  }

  beforeEach(async () => {
    actor = randomUUID();
    orgA = await createOrganization("ccv2b-a");
    orgB = await createOrganization("ccv2b-b");

    clientMigrated = await createClientAccount(orgA, "client-migre");
    clientOrphan = await createClientAccount(orgA, "client-orphelin");
    clientInB = await createClientAccount(orgB, "client-b");

    candidateMigrated = await createCandidate(orgA, "candidat-migre", clientMigrated);
    candidateNative = await createCandidate(orgA, "candidat-natif", null);
    candidateInB = await createCandidate(orgB, "candidat-b", clientInB);

    await seedLegacySatellites(orgA, clientMigrated);
    await seedLegacySatellites(orgA, clientOrphan);
    await seedLegacySatellites(orgB, clientInB);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("SCHEMA_INTEGRITY & BACKFILL", () => {
    it("associe les 7 familles du client migré, laisse le client orphelin intact, et ne perd aucune ligne", async () => {
      const before = await ownershipCounts(orgA);
      expect(before.owned).toEqual(Object.fromEntries(SATELLITE_FAMILIES.map((f) => [f, 0])));
      expect(before.legacyOnly).toEqual(Object.fromEntries(SATELLITE_FAMILIES.map((f) => [f, 2])));

      const report = await backfillSatellitesToCandidate(client, { organizationId: orgA });

      expect(report.failures).toEqual([]);
      for (const family of SATELLITE_FAMILIES) {
        expect(report.migratedByFamily[family]).toBe(1);
        // Réconciliation exigée §12 : aucune ligne créée ni supprimée.
        expect(report.totalAfterByFamily[family]).toBe(report.totalBeforeByFamily[family]);
        expect(report.alreadyOwnedByFamily[family] + report.migratedByFamily[family] + report.legacyRemainingByFamily[family]).toBe(report.totalAfterByFamily[family]);
        // La ligne du client orphelin reste Legacy-only : jamais déplacée vers un candidat inventé.
        expect(report.legacyRemainingByFamily[family]).toBe(1);
      }

      const owner = await client.companyCertification.findFirst({ where: { organizationId: orgA, clientAccountId: clientMigrated } });
      expect(owner?.candidateCompanyId).toBe(candidateMigrated);
      // ASSOCIATION, jamais DÉPLACEMENT : le lien Legacy est intact.
      expect(owner?.clientAccountId).toBe(clientMigrated);

      const orphan = await client.companyCertification.findFirst({ where: { organizationId: orgA, clientAccountId: clientOrphan } });
      expect(orphan?.candidateCompanyId).toBeNull();

      await cleanup([orgA, orgB]);
    }, 90000);

    it("le chemin de lecture Legacy retourne exactement les mêmes lignes après migration", async () => {
      const legacyBefore = await client.companyCertification.findMany({ where: { organizationId: orgA, clientAccountId: clientMigrated }, select: { id: true } });
      await backfillSatellitesToCandidate(client, { organizationId: orgA });
      const legacyAfter = await client.companyCertification.findMany({ where: { organizationId: orgA, clientAccountId: clientMigrated }, select: { id: true } });
      expect(legacyAfter).toEqual(legacyBefore);
      await cleanup([orgA, orgB]);
    }, 90000);
  });

  describe("BACKFILL_IDEMPOTENCE", () => {
    it("deux exécutions consécutives convergent : RUN_2 migre 0 ligne, aucun propriétaire réécrit, aucune duplication", async () => {
      const run1 = await backfillSatellitesToCandidate(client, { organizationId: orgA });
      const snapshot = await client.companyCertification.findMany({ where: { organizationId: orgA }, orderBy: { id: "asc" } });

      const run2 = await backfillSatellitesToCandidate(client, { organizationId: orgA });

      for (const family of SATELLITE_FAMILIES) {
        expect(run1.migratedByFamily[family]).toBe(1);
        expect(run2.migratedByFamily[family]).toBe(0);
        expect(run2.alreadyOwnedByFamily[family]).toBe(1);
        expect(run2.totalAfterByFamily[family]).toBe(run1.totalAfterByFamily[family]);
      }
      expect(run2.failures).toEqual([]);
      // Aucun changement de propriétaire inattendu, aucune ligne ajoutée.
      expect(await client.companyCertification.findMany({ where: { organizationId: orgA }, orderBy: { id: "asc" } })).toEqual(snapshot);
      // Le registre ne duplique pas non plus.
      expect(await client.candidateMigrationRegisterEntry.count({ where: { organizationId: orgA } })).toBe(1);

      await cleanup([orgA, orgB]);
    }, 90000);
  });

  describe("FAILURE_ATOMICITY", () => {
    it("un échec au milieu d'une unité annule l'unité ENTIÈRE — jamais 3 familles migrées sur 7 — et la reprise converge", async () => {
      // Échec réel injecté DANS la transaction, à la 4e famille : le client Prisma est enveloppé
      // uniquement côté test (aucun point d'injection en production).
      let familyCalls = 0;
      const failing = new Proxy(client, {
        get(target, prop, receiver) {
          if (prop === "$transaction") {
            return async (fn: (tx: unknown) => Promise<unknown>) =>
              (target.$transaction as (f: (tx: unknown) => Promise<unknown>) => Promise<unknown>)((tx) =>
                fn(
                  new Proxy(tx as object, {
                    get(txTarget, txProp, txReceiver) {
                      if (SATELLITE_FAMILIES.includes(txProp as SatelliteFamily)) {
                        familyCalls += 1;
                        if (familyCalls === 4) throw new Error("panne simulée au milieu de l'unité");
                      }
                      return Reflect.get(txTarget, txProp, txReceiver);
                    },
                  }),
                ),
              );
          }
          return Reflect.get(target, prop, receiver);
        },
      });

      const failed = await backfillSatellitesToCandidate(failing as unknown as PrismaClient, { organizationId: orgA });
      expect(failed.failures).toHaveLength(1);
      expect(failed.failures[0]?.candidateCompanyId).toBe(candidateMigrated);

      // Rollback complet : AUCUNE des 7 familles n'a été migrée, pas même les 3 premières.
      const after = await ownershipCounts(orgA);
      for (const family of SATELLITE_FAMILIES) {
        expect(after.owned[family]).toBe(0);
      }

      // Reprise : un run normal converge vers l'état attendu.
      const recovery = await backfillSatellitesToCandidate(client, { organizationId: orgA });
      expect(recovery.failures).toEqual([]);
      for (const family of SATELLITE_FAMILIES) {
        expect(recovery.migratedByFamily[family]).toBe(1);
      }

      await cleanup([orgA, orgB]);
    }, 90000);
  });

  describe("TENANT_INTEGRITY & LINEAGE — garanties EN BASE", () => {
    it.each(SATELLITE_FAMILIES)("%s : la base refuse un satellite d'orgA rattaché à une CandidateCompany d'orgB", async (family) => {
      const row = await (client as unknown as Record<SatelliteFamily, { findFirst: (a: unknown) => Promise<{ id: string } | null> }>)[family].findFirst({
        where: { organizationId: orgA, clientAccountId: clientMigrated },
      });
      const d = (client as unknown as Record<SatelliteFamily, { update: (a: unknown) => Promise<unknown> }>)[family];
      await expect(d.update({ where: { id: row!.id }, data: { candidateCompanyId: candidateInB } })).rejects.toThrow();
      await cleanup([orgA, orgB]);
    }, 90000);

    it("la base refuse un lignage incohérent : le satellite du client X ne peut pas appartenir au candidat migré depuis le client Y", async () => {
      const candidateFromOrphan = await createCandidate(orgA, "candidat-depuis-orphelin", clientOrphan);
      const row = await client.companyCertification.findFirst({ where: { organizationId: orgA, clientAccountId: clientMigrated } });
      await expect(client.companyCertification.update({ where: { id: row!.id }, data: { candidateCompanyId: candidateFromOrphan } })).rejects.toThrow();
      // Le rattachement cohérent, lui, passe.
      await expect(client.companyCertification.update({ where: { id: row!.id }, data: { candidateCompanyId: candidateMigrated } })).resolves.toBeTruthy();
      await cleanup([orgA, orgB]);
    }, 90000);

    it("une CandidateCompany NATIVE (sans sourceClientAccountId) ne peut pas s'approprier un satellite Legacy", async () => {
      const row = await client.companyCertification.findFirst({ where: { organizationId: orgA, clientAccountId: clientMigrated } });
      await expect(client.companyCertification.update({ where: { id: row!.id }, data: { candidateCompanyId: candidateNative } })).rejects.toThrow();
      await cleanup([orgA, orgB]);
    }, 90000);

    it("le backfill d'orgA ne touche jamais une ligne d'orgB", async () => {
      await backfillSatellitesToCandidate(client, { organizationId: orgA });
      const b = await ownershipCounts(orgB);
      for (const family of SATELLITE_FAMILIES) {
        expect(b.owned[family]).toBe(0);
      }
      await cleanup([orgA, orgB]);
    }, 90000);
  });

  describe("UNMIGRATABLE_REGISTER", () => {
    it("inscrit le client orphelin sans jamais créer de CandidateCompany, et n'expose aucune donnée sensible", async () => {
      const candidatesBefore = await client.candidateCompany.count({ where: { organizationId: orgA } });
      await backfillSatellitesToCandidate(client, { organizationId: orgA });
      expect(await client.candidateCompany.count({ where: { organizationId: orgA } })).toBe(candidatesBefore);

      const entries = await client.candidateMigrationRegisterEntry.findMany({ where: { organizationId: orgA } });
      expect(entries).toHaveLength(1);
      expect(entries[0]?.clientAccountId).toBe(clientOrphan);
      expect(entries[0]?.reason).toBe("NO_CANDIDATE_COMPANY");
      expect(entries[0]?.status).toBe("PENDING_PRODUCT_DECISION");
      expect(entries[0]?.legacySatelliteCount).toBe(7);

      // Le registre ne contient que des identifiants, un motif, un statut et un compteur.
      // CCV2-E.1 a ajouté `legacyDocumentCount`. Cette assertion sur la liste EXACTE des colonnes
      // est volontairement stricte : elle a détecté cet ajout, ce qui est exactement son rôle —
      // garantir qu'aucune donnée métier n'entre un jour dans le registre sans décision explicite.
      expect(Object.keys(entries[0] ?? {}).sort()).toEqual(
        ["clientAccountId", "firstSeenAt", "id", "lastSeenAt", "legacyDocumentCount", "legacySatelliteCount", "organizationId", "reason", "status"].sort(),
      );

      await cleanup([orgA, orgB]);
    }, 90000);

    it("passe l'entrée à RESOLVED lorsque le ClientAccount acquiert enfin une CandidateCompany", async () => {
      await backfillSatellitesToCandidate(client, { organizationId: orgA });
      await createCandidate(orgA, "promotion-assistee", clientOrphan);

      const second = await backfillSatellitesToCandidate(client, { organizationId: orgA });
      expect(second.registerEntriesResolved).toBe(1);

      const entry = await client.candidateMigrationRegisterEntry.findFirst({ where: { organizationId: orgA, clientAccountId: clientOrphan } });
      expect(entry?.status).toBe("RESOLVED");
      await cleanup([orgA, orgB]);
    }, 90000);
  });

  describe("TRADE_NAME", () => {
    it("backfille tradeName depuis CompanyLegalIdentity, sans jamais l'inventer depuis legalName", async () => {
      await client.companyLegalIdentity.create({
        data: { organizationId: orgA, clientAccountId: clientMigrated, legalName: "ACME SAS", tradeName: "Acme", createdBy: actor },
      });
      const report = await backfillSatellitesToCandidate(client, { organizationId: orgA });
      expect(report.tradeNamesBackfilled).toBe(1);

      const migratedCompany = await client.candidateCompany.findUnique({ where: { id: candidateMigrated } });
      expect(migratedCompany?.tradeName).toBe("Acme");
      // legalName n'est jamais écrasé.
      expect(migratedCompany?.legalName).toBeNull();

      // Le candidat natif n'a aucune source Legacy : tradeName reste NULL, jamais dérivé.
      expect((await client.candidateCompany.findUnique({ where: { id: candidateNative } }))?.tradeName).toBeNull();
      await cleanup([orgA, orgB]);
    }, 90000);

    it("laisse tradeName à NULL quand la source Legacy n'en déclare aucun", async () => {
      await client.companyLegalIdentity.create({
        data: { organizationId: orgA, clientAccountId: clientMigrated, legalName: "ACME SAS", createdBy: actor },
      });
      const report = await backfillSatellitesToCandidate(client, { organizationId: orgA });
      expect(report.tradeNamesBackfilled).toBe(0);
      expect((await client.candidateCompany.findUnique({ where: { id: candidateMigrated } }))?.tradeName).toBeNull();
      await cleanup([orgA, orgB]);
    }, 90000);
  });

  describe("DOCUMENT_ASSOCIATION & VERSIONING", () => {
    async function createDocumentWithTwoVersions(organizationId: string): Promise<{ documentId: string; versionIds: string[] }> {
      const documentId = randomUUID();
      await client.document.create({
        data: { id: documentId, organizationId, title: "Kbis", origin: "USER_UPLOAD", domain: "ORGANIZATION", status: "ACTIVE", createdByUserId: actor },
      });
      const versionIds: string[] = [];
      for (const versionNumber of [1, 2]) {
        const id = randomUUID();
        await client.documentVersion.create({
          data: {
            id,
            organizationId,
            documentId,
            versionNumber,
            originalFilename: `kbis-v${versionNumber}.pdf`,
            sanitizedFilename: `kbis-v${versionNumber}.pdf`,
            mimeType: "application/pdf",
            extension: "pdf",
            sizeBytes: 100 + versionNumber,
            checksum: `${versionNumber}`.repeat(64).slice(0, 64),
            storageKey: `k/${id}`,
            uploadedByUserId: actor,
          },
        });
        versionIds.push(id);
      }
      await client.document.update({ where: { id: documentId }, data: { currentVersionId: versionIds[1]!, currentVersionNumber: 2 } });
      return { documentId, versionIds };
    }

    it("associer un Document à une CandidateCompany ne duplique aucun blob et ne réécrit aucune version", async () => {
      const { documentId, versionIds } = await createDocumentWithTwoVersions(orgA);
      const versionsBefore = await client.documentVersion.findMany({ where: { documentId }, orderBy: { versionNumber: "asc" } });

      await client.documentCandidateCompanyAssociation.create({
        data: { organizationId: orgA, documentId, candidateCompanyId: candidateMigrated, category: "KBIS", createdByUserId: actor },
      });

      const versionsAfter = await client.documentVersion.findMany({ where: { documentId }, orderBy: { versionNumber: "asc" } });
      expect(versionsAfter).toEqual(versionsBefore);
      expect(versionsAfter).toHaveLength(2);
      expect(versionsAfter.map((v) => v.id)).toEqual(versionIds);
      // Aucune ligne Document supplémentaire : l'association ne recopie jamais le document.
      expect(await client.document.count({ where: { organizationId: orgA } })).toBe(1);
      const doc = await client.document.findUnique({ where: { id: documentId } });
      expect(doc?.currentVersionId).toBe(versionIds[1]);

      await cleanup([orgA, orgB]);
    }, 90000);

    it("refuse une seconde association du même document au même candidat, et tout rattachement cross-tenant", async () => {
      const { documentId } = await createDocumentWithTwoVersions(orgA);
      await client.documentCandidateCompanyAssociation.create({
        data: { organizationId: orgA, documentId, candidateCompanyId: candidateMigrated, category: "KBIS", createdByUserId: actor },
      });
      await expect(
        client.documentCandidateCompanyAssociation.create({
          data: { organizationId: orgA, documentId, candidateCompanyId: candidateMigrated, category: "OTHER", createdByUserId: actor },
        }),
      ).rejects.toThrow();

      // Cross-tenant : candidat d'orgB, en-tête orgA — refusé par la FK composite.
      await expect(
        client.documentCandidateCompanyAssociation.create({
          data: { organizationId: orgA, documentId, candidateCompanyId: candidateInB, category: "KBIS", createdByUserId: actor },
        }),
      ).rejects.toThrow();

      // Catégorie hors catalogue — refusée par le CHECK.
      await expect(
        client.documentCandidateCompanyAssociation.create({
          data: { organizationId: orgA, documentId, candidateCompanyId: candidateNative, category: "N_IMPORTE_QUOI", createdByUserId: actor },
        }),
      ).rejects.toThrow();

      await cleanup([orgA, orgB]);
    }, 90000);

    it("refuse une période de validité inversée", async () => {
      const { documentId } = await createDocumentWithTwoVersions(orgA);
      await expect(
        client.documentCandidateCompanyAssociation.create({
          data: {
            organizationId: orgA,
            documentId,
            candidateCompanyId: candidateMigrated,
            category: "INSURANCE",
            validFrom: new Date("2026-06-01"),
            validUntil: new Date("2026-01-01"),
            createdByUserId: actor,
          },
        }),
      ).rejects.toThrow();
      await cleanup([orgA, orgB]);
    }, 90000);
  });

  describe("BANKING_NON_EXPOSURE", () => {
    it("le compte bancaire change de propriétaire métier mais reste hors de toute lecture CandidateCompany", async () => {
      await backfillSatellitesToCandidate(client, { organizationId: orgA });

      const bank = await client.companyBankAccount.findFirst({ where: { organizationId: orgA, clientAccountId: clientMigrated } });
      expect(bank?.candidateCompanyId).toBe(candidateMigrated);

      // La lecture canonique d'une CandidateCompany ne joint AUCUNE donnée bancaire : ni IBAN, ni
      // BIC, ni compte. Preuve par sérialisation complète de la ligne candidate.
      const serialized = JSON.stringify(await client.candidateCompany.findUnique({ where: { id: candidateMigrated } }));
      expect(serialized).not.toContain("FR7630006000011234567890189");
      expect(serialized).not.toContain("AGRIFRPP");
      expect(serialized.toLowerCase()).not.toContain("iban");
      expect(serialized.toLowerCase()).not.toContain("bic");

      await cleanup([orgA, orgB]);
    }, 90000);
  });

  describe("CCV2-I.2 — REPRESENTANT : seule l'AUTORITE JURIDIQUE migre", () => {
    it("les signataires/representants legaux passent au candidat, les contacts CRM restent au client", async () => {
      // `company_representatives` porte DEUX semantiques dans la meme table. Migrer la famille en
      // bloc aurait fait changer de proprietaire des CONTACTS COMMERCIAUX — donnee CRM legitime du
      // ClientAccount (frontiere posee en CCV2-I.1) — qui auraient ensuite disparu de l'interface
      // client, la lecture y etant desormais bornee aux lignes Legacy (mission §17).
      //
      // Le defaut etait invisible sur le jeu de donnees courant, ou toutes les lignes Legacy sont
      // des SIGNATORY : ce test le rend detectable en melangeant deliberement les deux semantiques.
      const legalId = randomUUID();
      const contactId = randomUUID();
      await client.companyRepresentative.createMany({
        data: [
          { id: legalId, organizationId: orgA, clientAccountId: clientMigrated, firstName: "Grace", lastName: "Hopper", type: "LEGAL_REPRESENTATIVE", createdBy: actor },
          { id: contactId, organizationId: orgA, clientAccountId: clientMigrated, firstName: "Claire", lastName: "Martin", type: "COMMERCIAL_CONTACT", createdBy: actor },
        ],
      });

      await backfillSatellitesToCandidate(client, { organizationId: orgA });

      expect((await client.companyRepresentative.findUnique({ where: { id: legalId } }))?.candidateCompanyId, "l'autorite juridique appartient au candidat").toBe(candidateMigrated);
      expect((await client.companyRepresentative.findUnique({ where: { id: contactId } }))?.candidateCompanyId, "le contact commercial reste une donnee CRM du client").toBeNull();
      // Aucune ligne n'est supprimee ni deplacee : les deux existent toujours, cote client.
      expect((await client.companyRepresentative.findUnique({ where: { id: contactId } }))?.clientAccountId).toBe(clientMigrated);

      await cleanup([orgA, orgB]);
    }, 90000);
  });
});
