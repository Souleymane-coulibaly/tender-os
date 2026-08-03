import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import {
  classifyDceDocument,
  Dce,
  DceDocument,
  DceDocumentCategory,
  DceDocumentProcessingStatus,
  determineDceDocumentProcessingStatus,
  DceId,
  DCE_DOCUMENT_REPOSITORY,
  DCE_REPOSITORY,
  type DceDocumentRepository,
  type DceRepository,
} from "../../../dce";
import {
  DOCUMENT_REPOSITORY,
  DOCUMENT_VERSION_REPOSITORY,
  type DocumentRepository,
  type DocumentVersionRepository,
} from "../../../documents";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { DOCUMENT_EXTRACTION_REPOSITORY, type DocumentExtractionRepository } from "../ports/document-extraction.repository";
import { EXTRACTION_DISPATCHER, type ExtractionDispatcher } from "../ports/extraction-dispatcher";
import { resolveOrCreateDocumentExtraction } from "../services/resolve-or-create-document-extraction";

export type AutoTriggerDocumentExtractionCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  documentId: string;
  actorId: string;
  requestId?: string | undefined;
}>;

/**
 * Déclenchement SYSTÈME de l'extraction (correction Sprint 8A.2 bug #2/#1/#4 — "aucun document,
 * même importé via DCE, ne pouvait jamais être analysé" : rien ne déclenchait jamais
 * `StartDocumentExtractionUseCase`, ni après un import DCE, ni après un attachement Tender).
 * Appelé en continuation d'une action DÉJÀ autorisée (import DCE réussi, attachement Tender
 * réussi) — jamais depuis un contrôleur HTTP protégé par le RBAC Extraction lui-même, donc
 * jamais de vérification `ExtractionPermission` ici : l'actorId sert uniquement à la traçabilité
 * (audit log), jamais à fabriquer un rôle pour satisfaire un contrat RBAC qui n'a pas de sens dans
 * ce contexte (même motif que `BusinessAnalysisContentResolver`).
 *
 * Idempotent de bout en bout (mission "aucun double DceDocument", "aucun double job
 * d'extraction") : un second appel pour le même document (double clic, ré-import, retry) ne crée
 * jamais de second Dce, de second DceDocument, ni de second DocumentExtraction — chaque étape
 * relit l'existant avant de créer, et la contrainte unique `(dceId, documentId)`/`documentId`
 * reste le filet de sécurité réel en cas de course concurrente.
 */
@Injectable()
export class AutoTriggerDocumentExtractionUseCase {
  private readonly logger = new Logger(AutoTriggerDocumentExtractionUseCase.name);

  constructor(
    @Inject(DCE_REPOSITORY) private readonly dceRepository: DceRepository,
    @Inject(DCE_DOCUMENT_REPOSITORY) private readonly dceDocumentRepository: DceDocumentRepository,
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly documentVersionRepository: DocumentVersionRepository,
    @Inject(DOCUMENT_EXTRACTION_REPOSITORY) private readonly extractionRepository: DocumentExtractionRepository,
    @Inject(EXTRACTION_DISPATCHER) private readonly dispatcher: ExtractionDispatcher,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: AutoTriggerDocumentExtractionCommand): Promise<void> {
    // Jamais lier/extraire un document qui n'appartient pas (ou plus) à cette organisation —
    // `findById` est déjà scopé par `organizationId`, un document étranger renvoie `null` ici
    // exactement comme pour tout autre accès de ce codebase (mission "aucune extraction d'un
    // document étranger").
    const document = await this.documentRepository.findById({
      organizationId: command.organizationId,
      documentId: command.documentId,
    });
    if (!document) {
      this.logger.warn(
        `Skipping auto-extraction for document ${command.documentId}: not found in organization ${command.organizationId}.`,
      );
      return;
    }

    let dce = await this.dceRepository.findByTenderId({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
    });
    if (!dce) {
      const created = Dce.create({
        id: DceId.from(this.idGenerator.generate()),
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        createdByUserId: command.actorId,
        occurredAt: this.clock.now(),
      });
      dce = await this.dceRepository.create(created);
    }

    let link = await this.dceDocumentRepository.findByDceIdAndDocumentId({
      organizationId: command.organizationId,
      dceId: dce.id.value,
      documentId: command.documentId,
    });
    if (!link) {
      link = await this.createDceDocumentLink(command, dce.id.value, document.currentVersionId);
    }

    const extraction = await resolveOrCreateDocumentExtraction({
      extractionRepository: this.extractionRepository,
      organizationId: command.organizationId,
      dceId: dce.id.value,
      documentId: command.documentId,
      occurredAt: this.clock.now(),
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "SYSTEM",
      actorId: command.actorId,
      action: "extraction.auto_requested",
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
  }

  /** Classification déterministe identique à l'import DCE normal (mission §"jamais une
   *  supposition optimiste") quand la version courante est résolvable ; repli sur OTHER/IMPORTED
   *  (déjà les valeurs par défaut du schéma) si le document n'a exceptionnellement aucune version
   *  courante — ne bloque jamais le déclenchement de l'extraction pour cette seule raison. */
  private async createDceDocumentLink(
    command: AutoTriggerDocumentExtractionCommand,
    dceId: string,
    currentVersionId: string | undefined,
  ): Promise<DceDocument> {
    let category: DceDocumentCategory = DceDocumentCategory.Other;
    let processingStatus: DceDocumentProcessingStatus = DceDocumentProcessingStatus.Imported;

    if (currentVersionId) {
      const version = await this.documentVersionRepository.findById({
        organizationId: command.organizationId,
        documentId: command.documentId,
        versionId: currentVersionId,
      });
      if (version) {
        category = classifyDceDocument({ filename: version.originalFilename, extension: version.extension });
        processingStatus = determineDceDocumentProcessingStatus(version.extension);
      }
    }

    const occurredAt = this.clock.now();
    const created = DceDocument.create({
      dceId,
      documentId: command.documentId,
      organizationId: command.organizationId,
      createdByUserId: command.actorId,
      category,
      occurredAt,
    });
    created.transitionProcessingStatus(processingStatus, occurredAt);
    const link = await this.dceDocumentRepository.create(created);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "SYSTEM",
      actorId: command.actorId,
      action: "dce.document_auto_linked",
      resourceType: "dce_document",
      resourceId: command.documentId,
      requestId: command.requestId,
      metadata: { dceId, tenderId: command.tenderId, category, processingStatus },
    });

    return link;
  }
}
