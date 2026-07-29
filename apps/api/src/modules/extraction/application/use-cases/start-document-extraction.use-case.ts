import { Inject, Injectable } from "@nestjs/common";
import { DCE_DOCUMENT_REPOSITORY, DCE_REPOSITORY, type DceDocumentRepository, type DceRepository } from "../../../dce";
import { GetTenderUseCase } from "../../../tenders";
import { DocumentExtraction } from "../../domain/document-extraction.aggregate";
import { DocumentExtractionNotFoundError } from "../../domain/extraction-errors";
import { ExtractionPermission } from "../../domain/extraction-permission";
import { assertHasExtractionPermission } from "../policies/extraction-authorization.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { DOCUMENT_EXTRACTION_REPOSITORY, type DocumentExtractionRepository } from "../ports/document-extraction.repository";
import { EXTRACTION_DISPATCHER, type ExtractionDispatcher } from "../ports/extraction-dispatcher";
import { toDocumentExtractionSummary, type DocumentExtractionSummary } from "../dtos";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";

export type StartDocumentExtractionCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  documentId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/**
 * Déclenche une extraction (mission Sprint 3 §17) — idempotent : un second appel pour un document
 * déjà suivi ne recrée jamais un `DocumentExtraction`, il ne fait que redéclencher le traitement
 * (utile si un déclenchement précédent n'a jamais abouti, ex. crash du process avant `PROCESSING`).
 * Chaîne d'autorisation complète : authentification (en amont, côté contrôleur) → membership/rôle
 * (`actorRole`) → organisation (`organizationId`, scoping systématique) → Tender
 * (`GetTenderUseCase`, RBAC-gated) → DCE → document → permission Extraction elle-même.
 */
@Injectable()
export class StartDocumentExtractionUseCase {
  constructor(
    @Inject(DOCUMENT_EXTRACTION_REPOSITORY) private readonly extractionRepository: DocumentExtractionRepository,
    @Inject(DCE_REPOSITORY) private readonly dceRepository: DceRepository,
    @Inject(DCE_DOCUMENT_REPOSITORY) private readonly dceDocumentRepository: DceDocumentRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(EXTRACTION_DISPATCHER) private readonly dispatcher: ExtractionDispatcher,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly getTenderUseCase: GetTenderUseCase,
  ) {}

  async execute(command: StartDocumentExtractionCommand): Promise<DocumentExtractionSummary> {
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
        const existing = await context.findByDocumentId({
          organizationId: command.organizationId,
          documentId: command.documentId,
        });
        if (existing) {
          return existing;
        }
        const created = DocumentExtraction.create({
          documentId: command.documentId,
          dceId: dce.id.value,
          organizationId: command.organizationId,
          occurredAt: this.clock.now(),
        });
        await context.save(created);
        return created;
      },
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "extraction.requested",
      resourceType: "document_extraction",
      resourceId: command.documentId,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId, dceId: dce.id.value, status: extraction.status },
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
