import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { InternalDocumentCleanupService } from "../../../documents";
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
 *
 * Sprint 21 (hardening, correctif régression classe Sprint 20) — le verrou consultatif
 * (`lockGeneratedDocument`) ne protège plus que le calcul COURT du `revisionNumber` (lecture/
 * écriture Postgres uniquement), jamais `executionService.run()` (lecture storage + fusion DOCX +
 * écriture de l'artefact, potentiellement lent) qui s'exécute désormais entièrement HORS
 * transaction/verrou. Une régénération concurrente de la MÊME lignée qui aurait calculé le même
 * `revisionNumber` entre-temps est rejetée à la persistance finale par la contrainte UNIQUE
 * `[generatedDocumentId, revisionNumber]` (`ConcurrentDocumentGenerationError`, jamais une écriture
 * silencieusement perdue) — plus rare que l'ancien verrou long, mais jamais un appel storage tenu
 * pendant une transaction ouverte.
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
    private readonly internalDocumentCleanupService: InternalDocumentCleanupService,
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

    // Phase 1 — COURTE, DB uniquement : verrou + calcul du prochain numéro de révision. Le verrou
    // est relâché dès la fin de cette transaction, bien avant le rendu.
    const { previousRevisionId, nextRevisionNumber } = await this.atomicTransactionRunner.run(async () => {
      await this.generatedDocumentRepository.lockGeneratedDocument({ organizationId: command.organizationId, generatedDocumentId: generatedDocument.id });
      const previousRevision = await this.generatedDocumentRepository.findLatestRevision({ organizationId: command.organizationId, generatedDocumentId: generatedDocument.id });
      const nextRevisionNumber = await this.generatedDocumentRepository.nextRevisionNumber({ organizationId: command.organizationId, generatedDocumentId: generatedDocument.id });
      return { previousRevisionId: previousRevision?.id, nextRevisionNumber };
    });

    // Phase 2 — HORS transaction/verrou : le rendu (potentiellement lent, appel storage).
    const revision = await this.executionService.run({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      generatedDocumentId: generatedDocument.id,
      documentTemplateId: generatedDocument.documentTemplateId,
      previousRevisionId,
      revisionNumber: nextRevisionNumber,
      data: command.data,
      provenanceOverrides: command.provenanceOverrides,
      documentTitle: generatedDocument.title,
      requestId: command.requestId,
    });

    // Phase 3 — COURTE, DB uniquement : persistance finale. `createRevision` traduit une éventuelle
    // collision de `revisionNumber` (régénération concurrente pendant la Phase 2) en
    // `ConcurrentDocumentGenerationError`, jamais une écriture silencieusement perdue. Si cette
    // phase échoue, l'artefact déjà créé par la Phase 2 serait orphelin sans la compensation
    // explicite ci-dessous (même filet de sécurité que `GenerateDocumentUseCase`).
    try {
      await this.atomicTransactionRunner.run(async () => {
        await this.generatedDocumentRepository.createRevision(revision);

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
      });
    } catch (error) {
      if (revision.artifactDocumentId) {
        await this.internalDocumentCleanupService.purgeJustCreatedDocument({ organizationId: command.organizationId, documentId: revision.artifactDocumentId });
      }
      throw error;
    }

    const allRevisions = await this.generatedDocumentRepository.listRevisions({ organizationId: command.organizationId, generatedDocumentId: generatedDocument.id });
    return toGeneratedDocumentSummary(generatedDocument, allRevisions.length > 0 ? allRevisions : [revision]);
  }
}
