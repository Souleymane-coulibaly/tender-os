import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import {
  DocumentGenerationExecutionService,
  GeneratedDocument,
  GeneratedDocumentRevisionStatus,
  GENERATED_DOCUMENT_REPOSITORY,
  type GeneratedDocumentRepository,
  type GeneratedDocumentRevision,
} from "../../../document-generation";
import { TechnicalMemoStaleExportBlockedError, TechnicalMemoTemplateNotReadyError } from "../../domain/errors";
import { TechnicalMemoFreshness } from "../../domain/technical-memo-freshness";
import { assertTechnicalMemoAccess } from "../policies/technical-memo-access.policy";
import { TechnicalMemoAccessService } from "../services/technical-memo-access.service";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TECHNICAL_MEMO_REPOSITORY, type TechnicalMemoRepository } from "../ports/technical-memo.repository";
import { TECHNICAL_MEMO_SECTION_REPOSITORY, type TechnicalMemoSectionRepository } from "../ports/technical-memo-section.repository";
import { GetTechnicalMemoFreshnessUseCase } from "./get-technical-memo-freshness.use-case";

export type ExportTechnicalMemoCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  technicalMemoId: string;
  requestId?: string | undefined;
}>;

/**
 * Étape finale du pipeline (mission §2 "...→ Document-generation Sprint 10 → DOCX final éditable") —
 * délègue INTÉGRALEMENT le rendu à `DocumentGenerationExecutionService.run()` (appelant interne
 * contrôlé, mission §5 "ne jamais créer un second moteur DOCX") : ce service résout la version
 * ACTIVE du gabarit dérivé, fige `dataSnapshot`/`provenance`/`documentTemplateVersionId` DANS LA
 * révision produite (mission §61-62 "snapshot au moment de l'export, jamais recalculé plus tard"),
 * fusionne réellement le DOCX, stocke l'artefact via le module Documents. Une seule lignée
 * `GeneratedDocument` PAR mémoire (`subjectId = memo.id`, mission "jamais mélanger deux mémoires
 * dans la même lignée") — créée au premier export, réutilisée (nouvelle révision) aux exports
 * suivants (mission §42 "historique de versions du mémoire, jamais un écrasement silencieux").
 */
@Injectable()
export class ExportTechnicalMemoUseCase {
  constructor(
    @Inject(TECHNICAL_MEMO_REPOSITORY) private readonly technicalMemoRepository: TechnicalMemoRepository,
    @Inject(TECHNICAL_MEMO_SECTION_REPOSITORY) private readonly sectionRepository: TechnicalMemoSectionRepository,
    @Inject(GENERATED_DOCUMENT_REPOSITORY) private readonly generatedDocumentRepository: GeneratedDocumentRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly accessService: TechnicalMemoAccessService,
    private readonly documentGenerationExecutionService: DocumentGenerationExecutionService,
    private readonly getTechnicalMemoFreshnessUseCase: GetTechnicalMemoFreshnessUseCase,
  ) {}

  async execute(command: ExportTechnicalMemoCommand): Promise<GeneratedDocumentRevision> {
    const memo = await assertTechnicalMemoAccess(this.accessService, {
      organizationId: command.organizationId,
      technicalMemoId: command.technicalMemoId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.ExportTechnicalMemo,
      requireUseOrgPermission: true,
    });

    if (!memo.documentTemplateId) {
      throw new TechnicalMemoTemplateNotReadyError();
    }

    // Checkpoint 2.1-P2.1-FIX-D (mission §49/§110 "un mémoire STALE ne doit pas être finalisé
    // comme document courant sans garde explicite") — bloque AVANT tout export, jamais un DOCX
    // final produit silencieusement à partir d'un contenu obsolète.
    const freshness = await this.getTechnicalMemoFreshnessUseCase.execute({ organizationId: command.organizationId, technicalMemoId: memo.id, actorId: command.actorId, actorRole: command.actorRole });
    if (freshness.freshness !== TechnicalMemoFreshness.Current) {
      throw new TechnicalMemoStaleExportBlockedError({ freshness: freshness.freshness });
    }

    const sections = await this.sectionRepository.listByMemoId({ organizationId: command.organizationId, technicalMemoId: memo.id });
    const data: Record<string, unknown> = {};
    for (const section of sections) {
      if (section.content) {
        data[section.sectionKey] = section.content;
      }
    }

    const occurredAt = this.clock.now();

    // Verrou de portée AVANT lecture — même motif que Sprint 11B (deux exports concurrents du même
    // mémoire ne peuvent plus jamais lire "aucune lignée" toutes les deux puis en créer chacune une.
    await this.generatedDocumentRepository.lockGenerationScope({
      organizationId: command.organizationId,
      tenderId: memo.tenderId,
      documentTemplateId: memo.documentTemplateId,
      subjectId: memo.id,
    });

    let lineage = await this.generatedDocumentRepository.findLatestByScope({
      organizationId: command.organizationId,
      tenderId: memo.tenderId,
      documentTemplateId: memo.documentTemplateId,
      subjectId: memo.id,
    });

    if (!lineage) {
      lineage = GeneratedDocument.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        clientAccountId: memo.clientAccountId,
        tenderId: memo.tenderId,
        documentTemplateId: memo.documentTemplateId,
        title: `Mémoire technique — ${memo.tenderId}`,
        subjectId: memo.id,
        createdBy: command.actorId,
        occurredAt,
      });
      await this.generatedDocumentRepository.create(lineage);
    }

    const previousRevision = await this.generatedDocumentRepository.findLatestRevision({ organizationId: command.organizationId, generatedDocumentId: lineage.id });
    const revisionNumber = await this.generatedDocumentRepository.nextRevisionNumber({ organizationId: command.organizationId, generatedDocumentId: lineage.id });

    const revision = await this.documentGenerationExecutionService.run({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      generatedDocumentId: lineage.id,
      documentTemplateId: memo.documentTemplateId,
      previousRevisionId: previousRevision?.id,
      revisionNumber,
      data,
      documentTitle: `Mémoire technique — ${memo.tenderId}`,
      requestId: command.requestId,
    });

    if (revision.status === GeneratedDocumentRevisionStatus.Completed) {
      memo.markExported(occurredAt);
      await this.technicalMemoRepository.save(memo);
    }

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "technical_memo.exported",
      resourceType: "technical_memo",
      resourceId: memo.id,
      requestId: command.requestId,
      metadata: { revisionNumber, status: revision.status, generatedDocumentId: lineage.id },
    });

    return revision;
  }
}
