import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { CreateDocumentWithFirstVersionUseCase } from "../../application/use-cases/create-document-with-first-version.use-case";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../../application/ports/audit-log-writer";
import { STORAGE_PROVIDER, type StorageProvider } from "../../application/ports/storage-provider";

/**
 * Checkpoint TENDEROS-2.1-H.5 — INTÉGRITÉ DOCUMENTAIRE.
 *
 * Le constat entrant est un `Document` sans aucune `DocumentVersion`. La question n'est pas de faire
 * disparaître la ligne, mais de savoir si le CODE ACTUEL peut encore produire cet état — un compte
 * remis à zéro par une suppression n'apprendrait rien et effacerait la seule pièce à conviction.
 *
 * Ces preuves injectent donc de vraies pannes dans le chemin de création réel et observent ce qui
 * reste engagé en base.
 */
describe("H.5 — intégrité documentaire sous injection de panne (PostgreSQL réel)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const orgId = randomUUID();
  const userIds: string[] = [];
  let ownerId: string;

  let createUseCase: CreateDocumentWithFirstVersionUseCase;
  let auditWriter: AuditLogWriter;
  let storage: StorageProvider;
  let originalAuditRecord: AuditLogWriter["record"];
  let originalStorageDelete: StorageProvider["delete"];
  let originalStoragePut: StorageProvider["put"];

  function fileCommand(title: string) {
    return {
      organizationId: orgId,
      actorId: ownerId,
      actorRole: "OWNER",
      title,
      origin: "USER_UPLOAD",
      domain: "ORGANIZATION",
      file: {
        originalFilename: "piece.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
      },
    } as never;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    createUseCase = moduleRef.get(CreateDocumentWithFirstVersionUseCase);
    auditWriter = moduleRef.get<AuditLogWriter>(AUDIT_LOG_WRITER);
    storage = moduleRef.get<StorageProvider>(STORAGE_PROVIDER);
    originalAuditRecord = auditWriter.record.bind(auditWriter);
    originalStorageDelete = storage.delete.bind(storage);
    originalStoragePut = storage.put.bind(storage);

    await prisma.organization.create({ data: { id: orgId, name: "H5", slug: `h5-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    ownerId = randomUUID();
    await prisma.user.create({ data: { id: ownerId, email: `h5-${ownerId}@smoke.test`, displayName: "H5", status: "ACTIVE", passwordHash: "x" } });
    userIds.push(ownerId);
    await new PrismaMembershipRepository(prisma).save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: ownerId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );
  }, 300000);

  const storageDeleteCalls: string[] = [];

  afterEach(() => {
    storageDeleteCalls.length = 0;
    (auditWriter as { record: AuditLogWriter["record"] }).record = originalAuditRecord;
    (storage as { delete: StorageProvider["delete"] }).delete = originalStorageDelete;
    (storage as { put: StorageProvider["put"] }).put = originalStoragePut;
  });

  afterAll(async () => {
    await prisma.documentVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.document.deleteMany({ where: { organizationId: orgId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
  }, 180000);

  describe("§4/§5/§6 — le chemin de création ne peut pas produire un Document sans version", () => {
    it("chemin nominal : Document et première version naissent ensemble", async () => {
      const title = `H5 nominal ${randomUUID()}`;
      const created = await createUseCase.execute(fileCommand(title));

      const versions = await prisma.documentVersion.count({ where: { documentId: (created as { id: string }).id } });
      expect(versions, "un Document utilisable a toujours au moins une version").toBe(1);
      expect(await prisma.document.count({ where: { organizationId: orgId, title, currentVersionId: null } })).toBe(0);
    }, 300000);

    it("panne du STOCKAGE avant écriture : aucune ligne n'est engagée", async () => {
      const title = `H5 storage-fail ${randomUUID()}`;
      (storage as { put: StorageProvider["put"] }).put = async () => {
        throw new Error("panne injectée du stockage objet");
      };

      await expect(createUseCase.execute(fileCommand(title))).rejects.toThrow();
      expect(await prisma.document.count({ where: { organizationId: orgId, title } })).toBe(0);
    }, 300000);

    it("panne du JOURNAL D'AUDIT après la transaction : le couple Document/version reste COHÉRENT", async () => {
      // Point clé du §5 : la panne survient APRÈS que la transaction a été validée. L'invariant visé
      // par ce checkpoint — jamais de Document sans version — doit tenir même là.
      const title = `H5 audit-fail ${randomUUID()}`;
      (storage as { delete: StorageProvider["delete"] }).delete = async (key: string) => {
        storageDeleteCalls.push(key);
        return originalStorageDelete(key);
      };
      (auditWriter as { record: AuditLogWriter["record"] }).record = async () => {
        throw new Error("panne injectée du journal d'audit");
      };

      await expect(createUseCase.execute(fileCommand(title))).rejects.toThrow();

      const stored = await prisma.document.findFirst({ where: { organizationId: orgId, title } });

      // 1. L'invariant de H.5 tient : jamais de Document sans version, même après commit.
      expect(stored, "la transaction validée laisse bien ses lignes").not.toBeNull();
      const versions = await prisma.documentVersion.count({ where: { documentId: stored!.id } });
      expect(versions, "aucun Document sans version, même après une panne post-transaction").toBe(1);
      expect(stored!.currentVersionId, "le pointeur de version courante est posé").not.toBeNull();

      // 2. Et surtout : le FICHIER n'est PAS détruit. Avant correction H.5, la compensation
      //    s'exécutait pour toute erreur, y compris après le commit — elle supprimait le contenu
      //    d'un document que la base continuait de présenter comme valide. Mesuré alors :
      //    `documentSurvit: true, storageDeleteAppele: 1`.
      expect(storageDeleteCalls, "la compensation ne doit jamais détruire un contenu déjà engagé").toEqual([]);
    }, 300000);
  });

  describe("§19/§20 — sonde d'intégrité, exécutable avant une mise en production", () => {
    it("compte les Documents sans version, les versions orphelines et les associations rompues", async () => {
      // Requête volontairement LISIBLE et non destructive : elle a vocation à être rejouée telle
      // quelle avant et après une migration de production (§20/§21).
      const [versionless, orphanVersions, brokenClient, brokenCandidate, danglingPointer] = await Promise.all([
        prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM documents d WHERE NOT EXISTS (SELECT 1 FROM document_versions v WHERE v.document_id = d.id)`,
        prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM document_versions v WHERE NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = v.document_id)`,
        prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM document_client_account_associations a WHERE NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = a.document_id)`,
        prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM document_candidate_company_associations b WHERE NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = b.document_id)`,
        prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM documents d WHERE d.current_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM document_versions v WHERE v.id = d.current_version_id)`,
      ]);

      const report = {
        versionless: Number(versionless[0]!.n),
        orphanVersions: Number(orphanVersions[0]!.n),
        brokenClientAssociations: Number(brokenClient[0]!.n),
        brokenCandidateAssociations: Number(brokenCandidate[0]!.n),
        danglingCurrentVersionPointers: Number(danglingPointer[0]!.n),
      };
      console.log("H5_INTEGRITY_REPORT", JSON.stringify(report));

      // Ces quatre invariants sont des propriétés RÉFÉRENTIELLES : aucune donnée historique ne peut
      // légitimement les violer, contrairement au compte de Documents sans version, qui reflète un
      // résidu de fixture connu et volontairement CONSERVÉ (voir rapport H.5).
      expect(report.orphanVersions).toBe(0);
      expect(report.brokenClientAssociations).toBe(0);
      expect(report.brokenCandidateAssociations).toBe(0);
      expect(report.danglingCurrentVersionPointers).toBe(0);
    }, 300000);

    it("l'organisation créée par CE test ne laisse aucun Document sans version", async () => {
      // Portée volontairement limitée à l'organisation du test : une assertion globale à zéro
      // échouerait sur le résidu historique et forcerait sa suppression pour verdir un compteur —
      // exactement ce que la mission interdit.
      const versionless = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM documents d
        WHERE d.organization_id = ${orgId}::uuid
          AND NOT EXISTS (SELECT 1 FROM document_versions v WHERE v.document_id = d.id)`;
      expect(Number(versionless[0]!.n)).toBe(0);
    }, 300000);
  });
});
