import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { assertHasTenderPermission, GetTenderUseCase, TenderPermission } from "../../../tenders";
import { DocumentTemplateNotFoundError } from "../../domain/errors";
import { GeneratedDocument } from "../../domain/generated-document.aggregate";
import { assertDocumentGenerationAccess } from "../policies/document-generation-authorization.policy";
import { toGeneratedDocumentSummary, type GeneratedDocumentSummary } from "../dtos";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { DOCUMENT_TEMPLATE_REPOSITORY, type DocumentTemplateRepository } from "../ports/document-template.repository";
import { GENERATED_DOCUMENT_REPOSITORY, type GeneratedDocumentRepository } from "../ports/generated-document.repository";
import { DocumentGenerationExecutionService, type ProvenanceOverride } from "../services/document-generation-execution.service";

export type GenerateDocumentCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  documentTemplateId: string;
  title?: string | undefined;
  data: Readonly<Record<string, unknown>>;
  /** Correctif audit Codex P1-01 — JAMAIS peuplé depuis l'API publique (`GenerateDocumentBodySchema`
   *  ne déclare plus ce champ, donc `...body` ne peut jamais le porter) : un client HTTP ne doit
   *  jamais pouvoir fabriquer une provenance mensongère. Réservé à un futur appelant interne
   *  contrôlé (Sprint 11) qui résout une provenance réelle côté serveur avant d'appeler `execute`
   *  directement, hors HTTP. */
  provenanceOverrides?: Readonly<Record<string, ProvenanceOverride>> | undefined;
  requestId?: string | undefined;
}>;

/**
 * Lance une NOUVELLE lignée de génération pour ce Tender (mission route conceptuelle
 * `POST /tenders/:tenderId/documents/generate`). La version de template et le snapshot de données
 * sont figés EXPLICITEMENT ici, une seule fois — voir `DocumentGenerationExecutionService`. Une
 * génération techniquement FAILED reste un résultat légitime et persisté (jamais une exception qui
 * ferait disparaître la tentative), mirroring `ExportJob`.
 */
@Injectable()
export class GenerateDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_TEMPLATE_REPOSITORY) private readonly templateRepository: DocumentTemplateRepository,
    @Inject(GENERATED_DOCUMENT_REPOSITORY) private readonly generatedDocumentRepository: GeneratedDocumentRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly executionService: DocumentGenerationExecutionService,
  ) {}

  async execute(command: GenerateDocumentCommand): Promise<GeneratedDocumentSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.UseDocumentGeneration);
    const tender = await assertDocumentGenerationAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageDocumentGeneration,
    });

    const found = await this.templateRepository.findById({ organizationId: command.organizationId, documentTemplateId: command.documentTemplateId });
    if (!found) {
      throw new DocumentTemplateNotFoundError();
    }

    const occurredAt = this.clock.now();
    const generatedDocument = GeneratedDocument.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      tenderId: command.tenderId,
      documentTemplateId: command.documentTemplateId,
      title: command.title ?? found.template.name,
      createdBy: command.actorId,
      occurredAt,
    });

    const revision = await this.atomicTransactionRunner.run(async () => {
      await this.generatedDocumentRepository.create(generatedDocument);

      const revision = await this.executionService.run({
        organizationId: command.organizationId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        generatedDocumentId: generatedDocument.id,
        documentTemplateId: command.documentTemplateId,
        revisionNumber: 1,
        data: command.data,
        provenanceOverrides: command.provenanceOverrides,
        documentTitle: generatedDocument.title,
        requestId: command.requestId,
      });

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "document_generation.generated",
        resourceType: "generated_document",
        resourceId: generatedDocument.id,
        requestId: command.requestId,
        metadata: { tenderId: command.tenderId, documentTemplateId: command.documentTemplateId, revisionStatus: revision.status, missingFieldCount: revision.missingFields.length },
      });

      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: revision.status === "COMPLETED" ? "DocumentGenerationCompleted" : "DocumentGenerationFailed",
            aggregateType: "GeneratedDocument",
            aggregateId: generatedDocument.id,
            payload: { tenderId: command.tenderId, revisionId: revision.id },
            occurredAt,
          },
        ],
      });

      return revision;
    });

    return toGeneratedDocumentSummary(generatedDocument, [revision]);
  }
}
