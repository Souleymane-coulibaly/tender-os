import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { DocumentExtractionStatus } from "../domain/document-extraction-status";
import { DocumentExtractionNotFoundError } from "../domain/extraction-errors";
import type {
  DocumentExtractionRepository,
  ExclusiveExtractionContext,
  FinalizeAttemptOutcome,
  ReservationOutcome,
} from "../application/ports/document-extraction.repository";
import type { DocumentExtraction } from "../domain/document-extraction.aggregate";
import { toDomain, toPersistence } from "./document-extraction.persistence-mapper";

/** Transactions volontairement COURTES (correction P1-02) — jamais dimensionnées pour tenir une
 *  opération d'E/S (lecture de fichier, parsing, OCR) : le timeout par défaut de Prisma (5s)
 *  suffit largement à une lecture/écriture/verrou consultatif. */
const SHORT_TX_OPTIONS = { timeout: 10_000, maxWait: 10_000 } as const;

@Injectable()
export class PrismaDocumentExtractionRepository implements DocumentExtractionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByDocumentId(input: { organizationId: string; documentId: string }): Promise<DocumentExtraction | null> {
    const record = await this.prisma.documentExtraction.findFirst({
      where: { documentId: input.documentId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async create(extraction: DocumentExtraction): Promise<void> {
    const data = toPersistence(extraction);
    await this.prisma.documentExtraction.create({ data });
  }

  async save(extraction: DocumentExtraction): Promise<void> {
    const data = toPersistence(extraction);
    await this.prisma.documentExtraction.update({ where: { documentId: data.documentId }, data });
  }

  async reserveForProcessing(input: {
    organizationId: string;
    documentId: string;
    occurredAt: Date;
  }): Promise<ReservationOutcome> {
    return this.prisma.$transaction(async (tx) => {
      // Verrou consultatif Postgres scopé au document (mission Sprint 3 §15) : sérialise tout
      // déclenchement concurrent d'extraction pour CE document uniquement — tenu seulement le
      // temps de cette réservation, jamais pendant le traitement (correction P1-02).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.documentId}))`;

      const record = await tx.documentExtraction.findFirst({
        where: { documentId: input.documentId, organizationId: input.organizationId },
      });
      if (!record) {
        throw new DocumentExtractionNotFoundError();
      }

      const extraction = toDomain(record);
      if (
        extraction.status !== DocumentExtractionStatus.Pending &&
        extraction.status !== DocumentExtractionStatus.Ready
      ) {
        return { kind: "not_startable", status: extraction.status };
      }

      extraction.reserve(input.occurredAt);
      const data = toPersistence(extraction);
      await tx.documentExtraction.update({ where: { documentId: data.documentId }, data });

      return { kind: "reserved", extraction };
    }, SHORT_TX_OPTIONS);
  }

  async finalizeAttempt(input: {
    organizationId: string;
    documentId: string;
    expectedAttemptCount: number;
    occurredAt: Date;
    outcome: FinalizeAttemptOutcome;
  }): Promise<{ applied: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const finalStatus =
        input.outcome.kind === "succeeded"
          ? DocumentExtractionStatus.Succeeded
          : input.outcome.kind === "partially_succeeded"
            ? DocumentExtractionStatus.PartiallySucceeded
            : input.outcome.kind === "not_processable"
              ? DocumentExtractionStatus.NotProcessable
              : DocumentExtractionStatus.Failed;

      const data =
        input.outcome.kind === "succeeded" || input.outcome.kind === "partially_succeeded"
          ? {
              status: finalStatus,
              strategy: input.outcome.strategy,
              pageCount: input.outcome.pageCount ?? null,
              characterCount: input.outcome.characterCount,
              chunkCount: input.outcome.chunkCount,
              language: input.outcome.language ?? null,
              warnings: input.outcome.warnings,
              lastError: null,
              updatedAt: input.occurredAt,
            }
          : input.outcome.kind === "failed"
            ? {
                status: finalStatus,
                strategy: input.outcome.strategy ?? null,
                lastError: input.outcome.reason,
                updatedAt: input.occurredAt,
              }
            : { status: finalStatus, updatedAt: input.occurredAt };

      // Compare-and-set (mission "une tentative ancienne ne peut pas écraser une tentative
      // récente") : `attemptCount`/`status=PROCESSING` doivent encore correspondre à la
      // réservation en cours — sinon `count === 0` et rien n'est écrit (correction P1-02).
      const result = await tx.documentExtraction.updateMany({
        where: {
          documentId: input.documentId,
          organizationId: input.organizationId,
          attemptCount: input.expectedAttemptCount,
          status: DocumentExtractionStatus.Processing,
        },
        data,
      });

      if (result.count === 0) {
        return { applied: false };
      }

      if (input.outcome.kind === "succeeded" || input.outcome.kind === "partially_succeeded") {
        // Même transaction que la mise à jour de statut ci-dessus (mission §14 "rollback en cas
        // d'échec de persistance") : jamais un statut SUCCEEDED persisté sans les chunks qui le
        // justifient, ni l'inverse.
        await tx.extractionChunk.deleteMany({
          where: { documentId: input.documentId, organizationId: input.organizationId },
        });
        if (input.outcome.chunks.length > 0) {
          await tx.extractionChunk.createMany({
            data: input.outcome.chunks.map((chunk) => ({
              id: chunk.id,
              documentId: chunk.documentId,
              organizationId: chunk.organizationId,
              sequence: chunk.sequence,
              pageStart: chunk.pageStart ?? null,
              pageEnd: chunk.pageEnd ?? null,
              sheetName: chunk.sheetName ?? null,
              sectionTitle: chunk.sectionTitle ?? null,
              content: chunk.content,
              characterCount: chunk.characterCount,
              tokenEstimate: chunk.tokenEstimate ?? null,
              checksum: chunk.checksum,
              createdAt: chunk.createdAt,
            })),
          });
        }
      }

      return { applied: true };
    }, SHORT_TX_OPTIONS);
  }

  async runExclusiveShort<T>(input: {
    documentId: string;
    fn: (context: ExclusiveExtractionContext) => Promise<T>;
  }): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.documentId}))`;

      const context: ExclusiveExtractionContext = {
        findByDocumentId: async (findInput) => {
          const record = await tx.documentExtraction.findFirst({
            where: { documentId: findInput.documentId, organizationId: findInput.organizationId },
          });
          return record ? toDomain(record) : null;
        },
        save: async (extraction) => {
          const data = toPersistence(extraction);
          await tx.documentExtraction.upsert({
            where: { documentId: data.documentId },
            create: data,
            update: data,
          });
        },
      };

      return input.fn(context);
    }, SHORT_TX_OPTIONS);
  }
}
