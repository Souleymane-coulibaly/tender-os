import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { assertHasTenderPermission, GetTenderUseCase, TenderPermission } from "../../../tenders";
import { GeneratedDocumentNotFoundError } from "../../domain/errors";
import { assertDocumentGenerationAccess } from "../policies/document-generation-authorization.policy";
import { toGeneratedDocumentSummary, type GeneratedDocumentSummary } from "../dtos";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { GENERATED_DOCUMENT_REPOSITORY, type GeneratedDocumentRepository } from "../ports/generated-document.repository";
import { DocumentGenerationExecutionService, type ProvenanceOverride } from "../services/document-generation-execution.service";

export type RegenerateDocumentCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  generatedDocumentId: string;
  data: Readonly<Record<string, unknown>>;
  /** Correctif audit Codex P1-01 — voir `GenerateDocumentCommand.provenanceOverrides` : jamais
   *  peuplé depuis l'API publique (`RegenerateDocumentBodySchema` ne déclare plus ce champ). */
  provenanceOverrides?: Readonly<Record<string, ProvenanceOverride>> | undefined;
  requestId?: string | undefined;
}>;

/**
 * Ajoute une NOUVELLE révision à une lignée existante — jamais n'écrase une révision précédente
 * (mission "historique en append-only", route conceptuelle `POST /generated-documents/:id/
 * regenerate`, non préfixée par `tenderId`). Résout la version ACTIVE du template À CET INSTANT
 * (peut différer de celle de la révision précédente si le template a évolué entre-temps) — chaque
 * lancement fige sa propre décision explicite, jamais un héritage implicite de la révision
 * antérieure. Le `tenderId` est résolu à partir de la lignée chargée (scopée organisation) avant
 * toute vérification ClientAccess — même motif anti-IDOR que `GetGeneratedDocumentUseCase`.
 */
@Injectable()
export class RegenerateDocumentUseCase {
  constructor(
    @Inject(GENERATED_DOCUMENT_REPOSITORY) private readonly generatedDocumentRepository: GeneratedDocumentRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly executionService: DocumentGenerationExecutionService,
  ) {}

  async execute(command: RegenerateDocumentCommand): Promise<GeneratedDocumentSummary> {
    const generatedDocument = await this.generatedDocumentRepository.findById({ organizationId: command.organizationId, generatedDocumentId: command.generatedDocumentId });
    if (!generatedDocument) {
      throw new GeneratedDocumentNotFoundError();
    }

    assertHasTenderPermission(command.actorRole, TenderPermission.UseDocumentGeneration);
    await assertDocumentGenerationAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      tenderId: generatedDocument.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageDocumentGeneration,
    });

    const occurredAt = this.clock.now();

    const revision = await this.atomicTransactionRunner.run(async () => {
      // Verrou consultatif AVANT toute lecture/écriture de révision — deux régénérations
      // concurrentes de la MÊME lignée s'exécutent désormais strictement l'une après l'autre.
      await this.generatedDocumentRepository.lockGeneratedDocument({ organizationId: command.organizationId, generatedDocumentId: generatedDocument.id });

      const previousRevision = await this.generatedDocumentRepository.findLatestRevision({ organizationId: command.organizationId, generatedDocumentId: generatedDocument.id });
      const nextRevisionNumber = await this.generatedDocumentRepository.nextRevisionNumber({ organizationId: command.organizationId, generatedDocumentId: generatedDocument.id });

      const revision = await this.executionService.run({
        organizationId: command.organizationId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        generatedDocumentId: generatedDocument.id,
        documentTemplateId: generatedDocument.documentTemplateId,
        previousRevisionId: previousRevision?.id,
        revisionNumber: nextRevisionNumber,
        data: command.data,
        provenanceOverrides: command.provenanceOverrides,
        documentTitle: generatedDocument.title,
        requestId: command.requestId,
      });

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "document_generation.regenerated",
        resourceType: "generated_document",
        resourceId: generatedDocument.id,
        requestId: command.requestId,
        metadata: { tenderId: generatedDocument.tenderId, revisionNumber: nextRevisionNumber, revisionStatus: revision.status },
      });

      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: revision.status === "COMPLETED" ? "DocumentGenerationCompleted" : "DocumentGenerationFailed",
            aggregateType: "GeneratedDocument",
            aggregateId: generatedDocument.id,
            payload: { tenderId: generatedDocument.tenderId, revisionId: revision.id },
            occurredAt,
          },
        ],
      });

      return revision;
    });

    const allRevisions = await this.generatedDocumentRepository.listRevisions({ organizationId: command.organizationId, generatedDocumentId: generatedDocument.id });
    return toGeneratedDocumentSummary(generatedDocument, allRevisions.length > 0 ? allRevisions : [revision]);
  }
}
