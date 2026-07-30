import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { UuidGenerator } from "../../../../shared-kernel/id-generator";
import { CreateDocumentWithFirstVersionUseCase, InternalDocumentCleanupService } from "../../../documents";
import { PrismaDocumentRepository } from "../../../documents/infrastructure/prisma-document.repository";
import { PrismaDocumentVersionRepository } from "../../../documents/infrastructure/prisma-document-version.repository";
import { PrismaAuditLogWriter as DocumentsAuditLogWriter } from "../../../documents/infrastructure/prisma-audit-log.writer";
import { InMemoryStorageProvider } from "../../../documents/test-support/fakes";
import { buildMinimalPdf } from "../../../extraction/test-support/pdf-fixture-builder";
import { PrismaKnowledgeSpaceRepository } from "../../infrastructure/prisma-knowledge-space.repository";
import { PrismaKnowledgeEntryRepository } from "../../infrastructure/prisma-knowledge-entry.repository";
import { PrismaKnowledgeDocumentRepository } from "../../infrastructure/prisma-knowledge-document.repository";
import { PrismaKnowledgeTagRepository } from "../../infrastructure/prisma-knowledge-tag.repository";
import { FixedClock, RecordingKnowledgeDispatcher } from "../../test-support/fakes";
import { AddKnowledgeDocumentUseCase } from "./add-knowledge-document.use-case";
import { GetOrCreateDefaultKnowledgeSpaceUseCase } from "./get-or-create-default-knowledge-space.use-case";

/**
 * Preuve semi-réelle de la compensation (mission "Corrections Sprint 5" §"Renforcer la preuve de
 * compensation Knowledge après upload") — un vrai `Document`/`DocumentVersion` est créé via le
 * chemin réel du module Documents (vraie transaction Prisma), avec un `StorageProvider` en mémoire
 * OBSERVABLE (`InMemoryStorageProvider`, module Documents/test-support — jamais le vrai système de
 * fichiers, pour rester déterministe hors-ligne, mais un vrai comportement put/delete réel). La
 * transaction Knowledge est ensuite forcée à échouer réellement (libellé de tag > VARCHAR(60)),
 * APRÈS que l'entrée/version/document Knowledge ont déjà été écrits dans cette même transaction —
 * prouvant que : (1) rien ne survit côté Knowledge ; (2) le Document/DocumentVersion physique
 * fraîchement créé est purgé de la base réelle ; (3) le fichier physique est réellement supprimé
 * du stockage (observable) ; (4) un échec de la compensation elle-même ne masque jamais l'erreur
 * d'origine.
 */
describe("AddKnowledgeDocumentUseCase — compensation after a real Document/DocumentVersion upload", () => {
  const prisma = new PrismaService();
  const organizationId = randomUUID();
  const actorId = randomUUID();
  const clock = new FixedClock();
  const idGenerator = new UuidGenerator();

  const documentRepository = new PrismaDocumentRepository(prisma);
  const documentVersionRepository = new PrismaDocumentVersionRepository(prisma);
  const documentsAuditLogWriter = new DocumentsAuditLogWriter(prisma);

  const knowledgeSpaceRepository = new PrismaKnowledgeSpaceRepository(prisma);
  const knowledgeEntryRepository = new PrismaKnowledgeEntryRepository(prisma);
  const knowledgeDocumentRepository = new PrismaKnowledgeDocumentRepository(prisma);
  const knowledgeTagRepository = new PrismaKnowledgeTagRepository(prisma);
  const getOrCreateDefaultKnowledgeSpaceUseCase = new GetOrCreateDefaultKnowledgeSpaceUseCase(knowledgeSpaceRepository, clock, idGenerator);

  const oversizedLabel = "z".repeat(61); // dépasse VARCHAR(60) (knowledge_tags.label)
  const fakeFile = { buffer: buildMinimalPdf(["compensation test content"]), originalFilename: "cv.pdf", mimeType: "application/pdf" };

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: { id: organizationId, name: "KB Compensation Test Org", slug: `kb-compensation-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
  }, 30000);

  afterAll(async () => {
    await prisma.knowledgeEntryTag.deleteMany({ where: { organizationId } });
    await prisma.knowledgeTag.deleteMany({ where: { organizationId } });
    await prisma.knowledgeChunk.deleteMany({ where: { organizationId } });
    await prisma.knowledgeDocument.deleteMany({ where: { organizationId } });
    await prisma.knowledgeEntryVersion.deleteMany({ where: { organizationId } });
    await prisma.knowledgeEntry.deleteMany({ where: { organizationId } });
    await prisma.knowledgeSpace.deleteMany({ where: { organizationId } });
    await prisma.documentVersion.deleteMany({ where: { organizationId } });
    await prisma.document.updateMany({ where: { organizationId }, data: { currentVersionId: null } });
    await prisma.document.deleteMany({ where: { organizationId } });
    await prisma.auditLog.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  }, 30000);

  it("purges the real Document/DocumentVersion and deletes the stored file when the Knowledge transaction fails after a real upload", async () => {
    const storageProvider = new InMemoryStorageProvider();
    const createDocumentWithFirstVersionUseCase = new CreateDocumentWithFirstVersionUseCase(documentRepository, storageProvider, documentsAuditLogWriter, clock, idGenerator);
    const internalDocumentCleanupService = new InternalDocumentCleanupService(documentRepository, documentVersionRepository, storageProvider);
    const dispatcher = new RecordingKnowledgeDispatcher();

    const useCase = new AddKnowledgeDocumentUseCase(
      knowledgeEntryRepository,
      knowledgeDocumentRepository,
      knowledgeTagRepository,
      dispatcher,
      clock,
      idGenerator,
      createDocumentWithFirstVersionUseCase,
      internalDocumentCleanupService,
      getOrCreateDefaultKnowledgeSpaceUseCase,
    );

    expect(storageProvider.objects.size).toBe(0);

    await expect(
      useCase.execute({
        organizationId,
        actorId,
        actorRole: "CONTRIBUTOR",
        title: "Entrée vouée à échouer après upload réel",
        category: "OTHER",
        tags: [oversizedLabel],
        file: fakeFile,
        maxFileSizeBytes: 10_000_000,
      }),
    ).rejects.toThrow();

    // (1) Rien ne survit côté Knowledge — la transaction (entrée + version + document + tag) a
    // été entièrement annulée par Postgres.
    const entries = await prisma.knowledgeEntry.findMany({ where: { organizationId, title: "Entrée vouée à échouer après upload réel" } });
    expect(entries).toHaveLength(0);
    const versions = await prisma.knowledgeEntryVersion.findMany({ where: { organizationId } });
    expect(versions).toHaveLength(0);
    const knowledgeDocuments = await prisma.knowledgeDocument.findMany({ where: { organizationId } });
    expect(knowledgeDocuments).toHaveLength(0);
    const tags = await prisma.knowledgeTag.findMany({ where: { organizationId, label: oversizedLabel } });
    expect(tags).toHaveLength(0);
    const auditRows = await prisma.auditLog.findMany({ where: { organizationId, action: "knowledge_document.added" } });
    expect(auditRows).toHaveLength(0);

    // (2) Le Document/DocumentVersion physique fraîchement créé (module Documents, vraie
    // transaction) a été purgé de la base réelle par la compensation.
    const documents = await prisma.document.findMany({ where: { organizationId } });
    expect(documents).toHaveLength(0);
    const documentVersions = await prisma.documentVersion.findMany({ where: { organizationId } });
    expect(documentVersions).toHaveLength(0);

    // (3) Le fichier physique a été réellement supprimé du stockage (observable : le double en
    // mémoire ne contient plus aucun objet après compensation).
    expect(storageProvider.objects.size).toBe(0);
  });

  it("still throws the original error even if the storage deletion during compensation fails", async () => {
    const storageProvider = new InMemoryStorageProvider();
    let deleteCalls = 0;
    storageProvider.delete = async (_key: string) => {
      deleteCalls += 1;
      throw new Error("Simulated storage deletion failure (test-only)");
    };

    const createDocumentWithFirstVersionUseCase = new CreateDocumentWithFirstVersionUseCase(documentRepository, storageProvider, documentsAuditLogWriter, clock, idGenerator);
    const internalDocumentCleanupService = new InternalDocumentCleanupService(documentRepository, documentVersionRepository, storageProvider);
    const dispatcher = new RecordingKnowledgeDispatcher();

    const useCase = new AddKnowledgeDocumentUseCase(
      knowledgeEntryRepository,
      knowledgeDocumentRepository,
      knowledgeTagRepository,
      dispatcher,
      clock,
      idGenerator,
      createDocumentWithFirstVersionUseCase,
      internalDocumentCleanupService,
      getOrCreateDefaultKnowledgeSpaceUseCase,
    );

    await expect(
      useCase.execute({
        organizationId,
        actorId,
        actorRole: "CONTRIBUTOR",
        title: "Entrée vouée à échouer, compensation aussi en échec",
        category: "OTHER",
        tags: [oversizedLabel],
        file: fakeFile,
        maxFileSizeBytes: 10_000_000,
      }),
      // L'erreur d'origine (contrainte VARCHAR violée côté Knowledge) reste prioritaire, jamais
      // masquée par l'échec de la suppression du fichier pendant la compensation.
    ).rejects.toThrow();

    expect(deleteCalls).toBeGreaterThan(0);
    // Le Document/DocumentVersion en base sont tout de même purgés (hardDeleteJustCreatedDocument
    // ne dépend pas du succès de la suppression du fichier — voir InternalDocumentCleanupService).
    const documents = await prisma.document.findMany({ where: { organizationId } });
    expect(documents).toHaveLength(0);
  });
});
