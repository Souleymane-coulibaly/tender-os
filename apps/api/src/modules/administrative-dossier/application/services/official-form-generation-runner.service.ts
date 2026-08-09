import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import {
  ATOMIC_TRANSACTION_RUNNER,
  DOCUMENT_TEMPLATE_REPOSITORY,
  DocumentGenerationExecutionService,
  GENERATED_DOCUMENT_REPOSITORY,
  GeneratedDocument,
  toGeneratedDocumentSummary,
  type AtomicTransactionRunner,
  type DocumentTemplateRepository,
  type GeneratedDocumentRepository,
  type GeneratedDocumentSummary,
} from "../../../document-generation";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { OfficialFormTemplateNotConfiguredError } from "../../domain/errors";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";

export type RunOfficialFormGenerationInput = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  clientAccountId: string;
  /** Nom du `DocumentTemplate` SYSTEM/ORGANIZATION à résoudre (ex. "DC1", "DC2", "DC4") — jamais un
   *  id figé en dur, chaque organisation importe son propre gabarit (mission Sprint 11A). */
  templateName: string;
  /** Clé de portée (voir `GeneratedDocument.subjectId`) — `null` si une seule lignée possible pour
   *  ce (tenderId, templateName) (ex. DC1), une valeur stable sinon (ex. `subcontractorDeclarationId`
   *  pour DC4, `tenderId:candidate` ou `tenderId:member:<memberId>` pour DC2). JAMAIS dérivée
   *  implicitement par ce service — toujours fournie explicitement par l'appelant, qui seul connaît
   *  la sémantique métier de la portée (mission §9 "conserver explicitement economicOperatorId").
   */
  subjectId: string | null;
  documentTitle: string;
  data: Readonly<Record<string, unknown>>;
  auditAction: string;
  outboxEventTypeCompleted: string;
  outboxEventTypeFailed: string;
  auditMetadata?: Record<string, unknown> | undefined;
  requestId?: string | undefined;
}>;

/**
 * V2 Sprint 11B — point d'entrée UNIQUE pour "retrouver-ou-créer la lignée puis générer", réutilisé
 * par DC1/DC4/DC2 (correctif : Sprint 11A appelait `GeneratedDocument.create()` inconditionnellement
 * à chaque génération, ce qui créait une NOUVELLE lignée à chaque appel au lieu d'ajouter une
 * révision à la lignée existante — l'historique R1/R2/R3 mission §58/§39 n'était donc jamais
 * réellement exercé). Toujours le moteur `DocumentGenerationExecutionService` (Sprint 10), jamais un
 * second moteur OOXML.
 */
@Injectable()
export class OfficialFormGenerationRunner {
  constructor(
    @Inject(DOCUMENT_TEMPLATE_REPOSITORY) private readonly templateRepository: DocumentTemplateRepository,
    @Inject(GENERATED_DOCUMENT_REPOSITORY) private readonly generatedDocumentRepository: GeneratedDocumentRepository,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    private readonly executionService: DocumentGenerationExecutionService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async run(input: RunOfficialFormGenerationInput): Promise<GeneratedDocumentSummary> {
    const found = await this.templateRepository.findByName({ organizationId: input.organizationId, name: input.templateName });
    if (!found) throw new OfficialFormTemplateNotConfiguredError(input.templateName);

    const occurredAt = this.clock.now();

    const provenanceOverrides = Object.fromEntries(
      Object.keys(input.data).map((fieldKey) => [fieldKey, { sourceEntityType: input.templateName, sourceEntityId: input.subjectId ?? input.tenderId, valuePath: fieldKey }]),
    );

    const { generatedDocument, revision } = await this.atomicTransactionRunner.run(async () => {
      // Correctif audit Codex P2 — verrou consultatif sur la PORTÉE (tenderId, templateId,
      // subjectId) elle-même, pris AVANT `findLatestByScope` : deux générations concurrentes du
      // même opérateur ne peuvent plus jamais lire "aucune lignée" toutes les deux puis créer
      // chacune la leur — la seconde attend, retrouve la lignée que la première vient de créer, et
      // y ajoute la révision suivante au lieu d'une lignée parallèle.
      await this.generatedDocumentRepository.lockGenerationScope({ organizationId: input.organizationId, tenderId: input.tenderId, documentTemplateId: found.id, subjectId: input.subjectId });

      const existing = await this.generatedDocumentRepository.findLatestByScope({ organizationId: input.organizationId, tenderId: input.tenderId, documentTemplateId: found.id, subjectId: input.subjectId });

      const generatedDocument =
        existing ??
        GeneratedDocument.create({
          id: this.idGenerator.generate(),
          organizationId: input.organizationId,
          clientAccountId: input.clientAccountId,
          tenderId: input.tenderId,
          documentTemplateId: found.id,
          title: input.documentTitle,
          subjectId: input.subjectId ?? undefined,
          createdBy: input.actorId,
          occurredAt,
        });

      if (!existing) {
        await this.generatedDocumentRepository.create(generatedDocument);
      }

      const previousRevision = existing ? await this.generatedDocumentRepository.findLatestRevision({ organizationId: input.organizationId, generatedDocumentId: generatedDocument.id }) : undefined;
      const nextRevisionNumber = existing ? await this.generatedDocumentRepository.nextRevisionNumber({ organizationId: input.organizationId, generatedDocumentId: generatedDocument.id }) : 1;

      const revision = await this.executionService.run({
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        generatedDocumentId: generatedDocument.id,
        documentTemplateId: found.id,
        previousRevisionId: previousRevision?.id,
        revisionNumber: nextRevisionNumber,
        data: input.data,
        provenanceOverrides,
        documentTitle: generatedDocument.title,
        requestId: input.requestId,
      });

      await this.auditLogWriter.record({
        organizationId: input.organizationId,
        actorType: "USER",
        actorId: input.actorId,
        action: input.auditAction,
        resourceType: "generated_document",
        resourceId: generatedDocument.id,
        requestId: input.requestId,
        metadata: { ...input.auditMetadata, tenderId: input.tenderId, subjectId: input.subjectId, revisionNumber: nextRevisionNumber, revisionStatus: revision.status, missingFieldCount: revision.missingFields.length },
      });

      await this.outboxWriter.write({
        organizationId: input.organizationId,
        events: [
          {
            eventType: revision.status === "COMPLETED" ? input.outboxEventTypeCompleted : input.outboxEventTypeFailed,
            aggregateType: "GeneratedDocument",
            aggregateId: generatedDocument.id,
            payload: { tenderId: input.tenderId, subjectId: input.subjectId, revisionId: revision.id },
            occurredAt,
          },
        ],
      });

      return { generatedDocument, revision };
    });

    const allRevisions = await this.generatedDocumentRepository.listRevisions({ organizationId: input.organizationId, generatedDocumentId: generatedDocument.id });
    return toGeneratedDocumentSummary(generatedDocument, allRevisions.length > 0 ? allRevisions : [revision]);
  }
}
