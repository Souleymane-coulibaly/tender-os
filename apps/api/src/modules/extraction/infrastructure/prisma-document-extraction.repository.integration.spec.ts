import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { DocumentDomain } from "../../documents/domain/document-domain";
import { DocumentId } from "../../documents/domain/document-id.value-object";
import { DocumentOrigin } from "../../documents/domain/document-origin";
import { DocumentVersion } from "../../documents/domain/document-version.entity";
import { Document } from "../../documents/domain/document.aggregate";
import { PrismaDocumentRepository } from "../../documents/infrastructure/prisma-document.repository";
import { DocumentExtractionStatus } from "../domain/document-extraction-status";
import { DocumentExtractionStrategy } from "../domain/document-extraction-strategy";
import { DocumentExtraction } from "../domain/document-extraction.aggregate";
import { ExtractionChunk } from "../domain/extraction-chunk.entity";
import { PrismaDocumentExtractionRepository } from "./prisma-document-extraction.repository";

/**
 * Preuve réelle contre PostgreSQL (correction P1-02/P1-05) — les tests unitaires avec fakes
 * (process-document-extraction.use-case.spec.ts) ne suffisent pas à démontrer l'absence de race
 * condition ni le respect des contraintes CHECK : seul un vrai moteur transactionnel peut le
 * faire.
 */
describe("PrismaDocumentExtractionRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const documentRepository = new PrismaDocumentRepository(prisma);
  const repository = new PrismaDocumentExtractionRepository(prisma);

  const organizationId = randomUUID();
  const tenderId = randomUUID();
  const dceId = randomUUID();
  const actorId = randomUUID();
  const createdDocumentIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "DocumentExtraction Repository Integration Test Org",
        slug: `document-extraction-repo-integration-test-org-${organizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
    await prisma.tender.create({
      data: { id: tenderId, organizationId, title: "Marché pour tests DocumentExtraction", status: "DRAFT", tags: [], createdBy: actorId },
    });
    await prisma.dce.create({
      data: { id: dceId, organizationId, tenderId, status: "IMPORTED", createdByUserId: actorId },
    });
  });

  afterAll(async () => {
    await prisma.extractionChunk.deleteMany({ where: { organizationId } });
    await prisma.extractionAttempt.deleteMany({ where: { organizationId } });
    await prisma.documentExtraction.deleteMany({ where: { organizationId } });
    await prisma.dceDocument.deleteMany({ where: { dceId } });
    await prisma.dce.deleteMany({ where: { id: dceId } });
    if (createdDocumentIds.length > 0) {
      await prisma.document.updateMany({ where: { id: { in: createdDocumentIds } }, data: { currentVersionId: null } });
      await prisma.documentVersion.deleteMany({ where: { documentId: { in: createdDocumentIds } } });
      await prisma.document.deleteMany({ where: { id: { in: createdDocumentIds } } });
    }
    await prisma.tender.delete({ where: { id: tenderId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  async function createDocument(): Promise<string> {
    const id = randomUUID();
    createdDocumentIds.push(id);
    const document = Document.create({
      id: DocumentId.from(id),
      organizationId,
      title: "cctp.pdf",
      origin: DocumentOrigin.Dce,
      domain: DocumentDomain.Tender,
      createdByUserId: actorId,
      occurredAt: new Date(),
    });
    const version = DocumentVersion.create({
      id: randomUUID(),
      organizationId,
      documentId: document.id.value,
      versionNumber: 1,
      originalFilename: "cctp.pdf",
      sanitizedFilename: "cctp.pdf",
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: 42,
      checksum: `checksum-${id}`,
      storageKey: `${organizationId}/${document.id.value}/v1.pdf`,
      uploadedByUserId: actorId,
      occurredAt: new Date(),
    });
    document.promoteVersion({ versionId: version.id, versionNumber: 1, occurredAt: new Date() });
    await documentRepository.createWithInitialVersion({ document, version });
    return document.id.value;
  }

  async function seedPendingExtraction(): Promise<string> {
    const documentId = await createDocument();
    const extraction = DocumentExtraction.create({ documentId, dceId, organizationId, occurredAt: new Date() });
    await repository.create(extraction);
    return documentId;
  }

  describe("reserveForProcessing", () => {
    it("lets exactly one of two concurrent reservations for the same document succeed", async () => {
      const documentId = await seedPendingExtraction();

      const results = await Promise.all([
        repository.reserveForProcessing({ organizationId, documentId, occurredAt: new Date() }),
        repository.reserveForProcessing({ organizationId, documentId, occurredAt: new Date() }),
      ]);

      const reserved = results.filter((r) => r.kind === "reserved");
      const notStartable = results.filter((r) => r.kind === "not_startable");
      expect(reserved).toHaveLength(1);
      expect(notStartable).toHaveLength(1);

      const extraction = await repository.findByDocumentId({ organizationId, documentId });
      expect(extraction?.status).toBe(DocumentExtractionStatus.Processing);
      expect(extraction?.attemptCount).toBe(1); // jamais incrémenté deux fois pour une seule réservation gagnante.
    });

    it("returns not_startable (never throws) when the document is already PROCESSING", async () => {
      const documentId = await seedPendingExtraction();
      await repository.reserveForProcessing({ organizationId, documentId, occurredAt: new Date() });

      const second = await repository.reserveForProcessing({ organizationId, documentId, occurredAt: new Date() });
      expect(second).toEqual({ kind: "not_startable", status: DocumentExtractionStatus.Processing });
    });
  });

  describe("finalizeAttempt", () => {
    it("discards a finalization whose expectedAttemptCount is stale, never overwriting the current row", async () => {
      const documentId = await seedPendingExtraction();
      await repository.reserveForProcessing({ organizationId, documentId, occurredAt: new Date() });

      const result = await repository.finalizeAttempt({
        organizationId,
        documentId,
        expectedAttemptCount: 999,
        occurredAt: new Date(),
        outcome: { kind: "not_processable" },
      });

      expect(result.applied).toBe(false);
      const extraction = await repository.findByDocumentId({ organizationId, documentId });
      expect(extraction?.status).toBe(DocumentExtractionStatus.Processing);
    });

    it("atomically persists the final status and the chunks together on success", async () => {
      const documentId = await seedPendingExtraction();
      const reservation = await repository.reserveForProcessing({ organizationId, documentId, occurredAt: new Date() });
      expect(reservation.kind).toBe("reserved");

      const chunk = ExtractionChunk.create({
        id: randomUUID(),
        documentId,
        organizationId,
        sequence: 0,
        content: "Some real extracted content.",
        occurredAt: new Date(),
      });

      const result = await repository.finalizeAttempt({
        organizationId,
        documentId,
        expectedAttemptCount: 1,
        occurredAt: new Date(),
        outcome: {
          kind: "succeeded",
          strategy: DocumentExtractionStrategy.NativeText,
          characterCount: chunk.characterCount,
          chunkCount: 1,
          warnings: [],
          chunks: [chunk],
        },
      });

      expect(result.applied).toBe(true);
      const extraction = await repository.findByDocumentId({ organizationId, documentId });
      expect(extraction?.status).toBe(DocumentExtractionStatus.Succeeded);
      const persistedChunks = await prisma.extractionChunk.findMany({ where: { documentId, organizationId } });
      expect(persistedChunks).toHaveLength(1);
    });

    it("never duplicates chunks across two finalizations of successive attempts (retry never accumulates)", async () => {
      const documentId = await seedPendingExtraction();
      await repository.reserveForProcessing({ organizationId, documentId, occurredAt: new Date() });
      await repository.finalizeAttempt({
        organizationId,
        documentId,
        expectedAttemptCount: 1,
        occurredAt: new Date(),
        outcome: { kind: "failed", reason: "boom" },
      });

      // Retry manuel : FAILED -> READY -> nouvelle réservation -> nouvelle finalisation réussie.
      await prisma.documentExtraction.update({ where: { documentId }, data: { status: DocumentExtractionStatus.Ready } });
      await repository.reserveForProcessing({ organizationId, documentId, occurredAt: new Date() });
      const chunk = ExtractionChunk.create({
        id: randomUUID(),
        documentId,
        organizationId,
        sequence: 0,
        content: "Retried content.",
        occurredAt: new Date(),
      });
      await repository.finalizeAttempt({
        organizationId,
        documentId,
        expectedAttemptCount: 2,
        occurredAt: new Date(),
        outcome: {
          kind: "succeeded",
          strategy: DocumentExtractionStrategy.NativeText,
          characterCount: chunk.characterCount,
          chunkCount: 1,
          warnings: [],
          chunks: [chunk],
        },
      });

      const persistedChunks = await prisma.extractionChunk.findMany({ where: { documentId, organizationId } });
      expect(persistedChunks).toHaveLength(1);
    });
  });

  describe("database invariants (correction P1-05)", () => {
    let invariantDocumentId: string;

    beforeEach(async () => {
      invariantDocumentId = await seedPendingExtraction();
    });

    it("rejects an invalid document_extractions.status value at the database level", async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE document_extractions SET status = 'NOT_A_REAL_STATUS' WHERE document_id = $1`,
          invariantDocumentId,
        ),
      ).rejects.toThrow();
    });

    it("rejects an invalid document_extractions.strategy value at the database level", async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE document_extractions SET strategy = 'NOT_A_REAL_STRATEGY' WHERE document_id = $1`,
          invariantDocumentId,
        ),
      ).rejects.toThrow();
    });

    it("rejects an invalid extraction_attempts.outcome value at the database level", async () => {
      await expect(
        prisma.extractionAttempt.create({
          data: {
            id: randomUUID(),
            documentId: invariantDocumentId,
            organizationId,
            attemptNumber: 1,
            strategy: DocumentExtractionStrategy.NativeText,
            outcome: "NOT_A_REAL_OUTCOME",
            startedAt: new Date(),
            finishedAt: new Date(),
            durationMs: 10,
            warnings: [],
          },
        }),
      ).rejects.toThrow();
    });

    it("rejects a duplicate (document_id, attempt_number) pair at the database level", async () => {
      const attemptData = {
        documentId: invariantDocumentId,
        organizationId,
        attemptNumber: 1,
        strategy: DocumentExtractionStrategy.NativeText,
        outcome: "FAILED" as const,
        startedAt: new Date(),
        finishedAt: new Date(),
        durationMs: 10,
        warnings: [],
      };
      await prisma.extractionAttempt.create({ data: { id: randomUUID(), ...attemptData } });

      await expect(
        prisma.extractionAttempt.create({ data: { id: randomUUID(), ...attemptData } }),
      ).rejects.toThrow();
    });
  });
});
