import { Inject, Injectable } from "@nestjs/common";
import { DCE_DOCUMENT_REPOSITORY, DCE_REPOSITORY, type DceDocumentRepository, type DceRepository } from "../../../dce";
import { GetTenderUseCase } from "../../../tenders";
import { DocumentExtractionNotFoundError } from "../../domain/extraction-errors";
import { ExtractionPermission } from "../../domain/extraction-permission";
import { assertHasExtractionPermission } from "../policies/extraction-authorization.policy";
import { assertExtractionIsRetryable } from "../policies/extraction-retry.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { DOCUMENT_EXTRACTION_REPOSITORY, type DocumentExtractionRepository } from "../ports/document-extraction.repository";
import { EXTRACTION_DISPATCHER, type ExtractionDispatcher } from "../ports/extraction-dispatcher";
import { toDocumentExtractionSummary, type DocumentExtractionSummary } from "../dtos";
import { EXTRACTION_CONFIG, type ExtractionConfig } from "../../infrastructure/extraction-config";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";

export type RetryDocumentExtractionCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  documentId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/**
 * Relance une extraction FAILED (mission Sprint 3 §16) — jamais un retry indéfini : borné par
 * `EXTRACTION_CONFIG.ocrMaxRetries` (même variable que celle qui borne les retries transitoires du
 * fournisseur OCR ; aucune variable de configuration dédiée n'est prévue par la mission pour un
 * plafond distinct au niveau de l'extraction entière, donc ce plafond est réutilisé tel quel,
 * documenté explicitement ici). Toujours sous le verrou par document : un retry concurrent au
 * traitement en cours ne doit jamais dupliquer les chunks ni écraser un résultat plus récent —
 * `assertExtractionIsRetryable` échoue déjà si le statut n'est plus FAILED au moment de la lecture
 * sous verrou.
 */
@Injectable()
export class RetryDocumentExtractionUseCase {
  constructor(
    @Inject(DOCUMENT_EXTRACTION_REPOSITORY) private readonly extractionRepository: DocumentExtractionRepository,
    @Inject(DCE_REPOSITORY) private readonly dceRepository: DceRepository,
    @Inject(DCE_DOCUMENT_REPOSITORY) private readonly dceDocumentRepository: DceDocumentRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(EXTRACTION_DISPATCHER) private readonly dispatcher: ExtractionDispatcher,
    @Inject(EXTRACTION_CONFIG) private readonly config: ExtractionConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly getTenderUseCase: GetTenderUseCase,
  ) {}

  async execute(command: RetryDocumentExtractionCommand): Promise<DocumentExtractionSummary> {
    assertHasExtractionPermission(command.actorRole, ExtractionPermission.Trigger);

    await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorRole: command.actorRole,
    });

    const dce = await this.dceRepository.findByTenderId({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
    });
    if (!dce) {
      throw new DocumentExtractionNotFoundError();
    }

    const link = await this.dceDocumentRepository.findByDceIdAndDocumentId({
      organizationId: command.organizationId,
      dceId: dce.id.value,
      documentId: command.documentId,
    });
    if (!link) {
      throw new DocumentExtractionNotFoundError();
    }

    const extraction = await this.extractionRepository.runExclusiveShort({
      documentId: command.documentId,
      fn: async (context) => {
        const current = await context.findByDocumentId({
          organizationId: command.organizationId,
          documentId: command.documentId,
        });
        if (!current) {
          throw new DocumentExtractionNotFoundError();
        }
        assertExtractionIsRetryable(current, this.config.ocrMaxRetries);
        current.resetForRetry(this.clock.now());
        await context.save(current);
        return current;
      },
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "extraction.retry_requested",
      resourceType: "document_extraction",
      resourceId: command.documentId,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId, dceId: dce.id.value, attemptCount: extraction.attemptCount },
    });

    this.dispatcher.dispatch({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      dceId: dce.id.value,
      documentId: command.documentId,
      requestId: command.requestId,
    });

    return toDocumentExtractionSummary(extraction);
  }
}
