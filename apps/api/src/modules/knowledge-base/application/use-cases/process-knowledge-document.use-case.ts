import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { ExtractDocumentContentUseCase } from "../../../extraction";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { KNOWLEDGE_DOCUMENT_REPOSITORY, type FinalizeKnowledgeDocumentOutcome, type KnowledgeDocumentRepository } from "../ports/knowledge-document.repository";

export type ProcessKnowledgeDocumentCommand = Readonly<{
  organizationId: string;
  knowledgeDocumentId: string;
  requestId?: string | undefined;
}>;

/**
 * Orchestrateur du traitement d'un document de connaissance (mission Sprint 5 §7) — même motif en
 * 3 phases que `ProcessDocumentExtractionUseCase`/`ProcessAnalysisJobUseCase` : réservation
 * atomique courte, appel du contrat public Extraction HORS transaction, finalisation atomique
 * courte (statut + chunks + statut de l'entrée, tous dans la même transaction — voir
 * `KnowledgeDocumentRepository.finalizeAttempt`, qui effectue directement la transition de
 * `KnowledgeEntry.status` avec son propre `tx`, corrigé lors de l'audit "Anomalie 3").
 */
@Injectable()
export class ProcessKnowledgeDocumentUseCase {
  private readonly logger = new Logger(ProcessKnowledgeDocumentUseCase.name);

  constructor(
    @Inject(KNOWLEDGE_DOCUMENT_REPOSITORY) private readonly knowledgeDocumentRepository: KnowledgeDocumentRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly extractDocumentContentUseCase: ExtractDocumentContentUseCase,
  ) {}

  async execute(command: ProcessKnowledgeDocumentCommand): Promise<void> {
    const reservedAt = this.clock.now();
    const reservation = await this.knowledgeDocumentRepository.reserveForProcessing({
      organizationId: command.organizationId,
      knowledgeDocumentId: command.knowledgeDocumentId,
      occurredAt: reservedAt,
    });

    if (reservation.kind === "not_startable") {
      this.logger.warn(`Skipping knowledge document ${command.knowledgeDocumentId}: status is ${reservation.status}, not startable.`);
      return;
    }

    const { document } = reservation;

    // Phase 2 — hors transaction : appel du contrat public Extraction (mission §6/§7).
    const extraction = await this.extractDocumentContentUseCase.execute({ organizationId: command.organizationId, documentId: document.documentId });

    let outcome: FinalizeKnowledgeDocumentOutcome;
    if (extraction.kind === "failed") {
      outcome = { kind: "failed", errorMessage: extraction.reason };
    } else if (extraction.kind === "not_processable") {
      outcome = { kind: "failed", errorMessage: "This document format has no supported extractor." };
    } else {
      outcome = { kind: extraction.kind, language: extraction.language, warnings: extraction.warnings };
    }

    const chunks = extraction.kind === "succeeded" || extraction.kind === "partially_succeeded" ? extraction.chunks : [];

    const finalizeResult = await this.knowledgeDocumentRepository.finalizeAttempt({
      organizationId: command.organizationId,
      knowledgeDocumentId: command.knowledgeDocumentId,
      expectedAttemptCount: document.attemptCount,
      occurredAt: this.clock.now(),
      outcome,
      chunks,
    });

    if (!finalizeResult.applied) {
      this.logger.warn(`Finalization for knowledge document ${command.knowledgeDocumentId} discarded: reservation no longer current.`);
      return;
    }

    try {
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "SYSTEM",
        action: outcome.kind === "failed" ? "knowledge_document.processing_failed" : "knowledge_document.processing_completed",
        resourceType: "knowledge_document",
        resourceId: command.knowledgeDocumentId,
        requestId: command.requestId,
        metadata: outcome.kind === "failed" ? { errorMessage: outcome.errorMessage } : { outcome: outcome.kind, chunkCount: chunks.length },
      });
    } catch (auditError) {
      this.logger.error(
        `Knowledge document ${command.knowledgeDocumentId} reached a final state (${outcome.kind}) but the audit log write failed: ` +
          `${auditError instanceof Error ? auditError.message : String(auditError)}`,
      );
    }
  }
}
