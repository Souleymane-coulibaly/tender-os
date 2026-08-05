import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { GetDocumentUseCase } from "../../../documents";
import type { AdministrativeDocumentType } from "../../domain/administrative-document-type";
import { AdministrativeDocument } from "../../domain/administrative-document.aggregate";
import { AdministrativeDocumentRevision } from "../../domain/administrative-document-revision.entity";
import { AdministrativeDocumentRevisionStatus } from "../../domain/administrative-document-revision-status";
import {
  AdministrativeDocumentNotFoundError,
  AdministrativeDocumentNotReadyForValidationError,
  AdministrativeDocumentRevisionNotFoundError,
} from "../../domain/errors";
import { AdministrativeDocumentSummary, toAdministrativeDocumentSummary } from "../dtos";
import { ADMINISTRATIVE_DOCUMENT_REPOSITORY, type AdministrativeDocumentRepository } from "../ports/administrative-document.repository";
import { ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY, type AdministrativeDocumentRevisionRepository } from "../ports/administrative-document-revision.repository";
import { ADMINISTRATIVE_REQUIREMENT_REPOSITORY, type AdministrativeRequirementRepository } from "../ports/administrative-requirement.repository";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import { AdministrativeDossierRecalculationService } from "../services/administrative-dossier-recalculation.service";
import { verifyAttachableDocument } from "../services/verify-attachable-document";

export type CreateAdministrativeDocumentCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  documentType: AdministrativeDocumentType;
  label: string;
  requirementId?: string | undefined;
}>;

/** Mission §4/§21 — crée une pièce administrative avec sa première révision, vide (DRAFT, aucun
 *  fichier attaché encore) — mission "un document laissé vide avant qu'un fichier y soit attaché".
 *  Seule création dans ce fichier nichée sous `/tenders/:tenderId` (les autres opèrent directement
 *  sur `administrative-documents/:id`, sans tenderId dans l'URL — le tenderId est alors dérivé du
 *  document chargé, jamais un second paramètre non vérifié). */
@Injectable()
export class CreateAdministrativeDocumentUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ADMINISTRATIVE_DOCUMENT_REPOSITORY) private readonly documentRepository: AdministrativeDocumentRepository,
    @Inject(ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY) private readonly revisionRepository: AdministrativeDocumentRevisionRepository,
    @Inject(ADMINISTRATIVE_REQUIREMENT_REPOSITORY) private readonly requirementRepository: AdministrativeRequirementRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    private readonly statusRecalculation: AdministrativeDossierRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateAdministrativeDocumentCommand): Promise<AdministrativeDocumentSummary> {
    const { dossier } = await this.accessService.loadDossierByTenderId({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: command.tenderId,
      permission: ClientPermission.ManageAdministrativeDocuments,
    });

    const occurredAt = this.clock.now();
    const document = AdministrativeDocument.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      administrativeDossierId: dossier.id,
      tenderId: command.tenderId,
      documentType: command.documentType,
      label: command.label,
      requirementId: command.requirementId,
      createdBy: command.actorId,
      occurredAt,
    });
    await this.documentRepository.create(document);

    const revision = AdministrativeDocumentRevision.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      administrativeDocumentId: document.id,
      revisionNumber: 1,
      createdBy: command.actorId,
      occurredAt,
    });
    await this.revisionRepository.create(revision);

    if (command.requirementId) {
      const requirement = await this.requirementRepository.findById({ organizationId: command.organizationId, requirementId: command.requirementId });
      if (requirement && requirement.tenderId === command.tenderId) {
        requirement.matchDocument({ documentId: document.id, occurredAt });
        await this.requirementRepository.save(requirement);
      }
    }

    await this.statusRecalculation.recompute({ organizationId: command.organizationId, dossierId: dossier.id });
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "ADMINISTRATIVE_DOCUMENT_CREATED",
      resourceType: "ADMINISTRATIVE_DOCUMENT",
      resourceId: document.id,
    });

    return toAdministrativeDocumentSummary(document, [revision]);
  }
}

export type AttachAdministrativeDocumentRevisionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  administrativeDocumentId: string;
  documentId: string;
  expiresAt?: Date | undefined;
  /** Sprint 8C.1 — posé uniquement par `AdministrativeGeneratedDocumentService` pour une Annexe
   *  TenderOS générée, jamais fourni par un acteur pour un fichier déposé manuellement. */
  officialTemplateId?: string | undefined;
  formDataSnapshot?: Record<string, unknown> | undefined;
}>;

/** Mission §21 — attache un fichier VÉRIFIÉ (audit Codex P1-003, même motif que
 *  `verifyAttachableDocument` pour Livrables) à la révision DRAFT courante si elle existe, sinon
 *  crée une NOUVELLE révision (jamais une réécriture d'une révision non-DRAFT). Si une révision
 *  précédente était déjà validée, elle passe à REPLACED et la validation du document est rouverte
 *  (`clearValidation`) — jamais silencieusement laissée VALIDATED sur un contenu remplacé. */
@Injectable()
export class AttachAdministrativeDocumentRevisionUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ADMINISTRATIVE_DOCUMENT_REPOSITORY) private readonly documentRepository: AdministrativeDocumentRepository,
    @Inject(ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY) private readonly revisionRepository: AdministrativeDocumentRevisionRepository,
    private readonly getDocumentUseCase: GetDocumentUseCase,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    private readonly statusRecalculation: AdministrativeDossierRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: AttachAdministrativeDocumentRevisionCommand): Promise<AdministrativeDocumentSummary> {
    const document = await this.documentRepository.findById({ organizationId: command.organizationId, documentId: command.administrativeDocumentId });
    if (!document) {
      throw new AdministrativeDocumentNotFoundError();
    }

    await this.accessService.assertTenderAccess({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: document.tenderId,
      permission: ClientPermission.ManageAdministrativeDocuments,
    });

    const verified = await verifyAttachableDocument(this.getDocumentUseCase, {
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      documentId: command.documentId,
    });

    const revisions = await this.revisionRepository.listByDocument({ organizationId: command.organizationId, administrativeDocumentId: document.id });
    const latest = revisions[revisions.length - 1];
    const occurredAt = this.clock.now();

    let target: AdministrativeDocumentRevision;
    let supersededValidatedRevision = false;
    if (latest && latest.status === AdministrativeDocumentRevisionStatus.Draft) {
      target = latest;
    } else {
      target = AdministrativeDocumentRevision.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        administrativeDocumentId: document.id,
        revisionNumber: (latest?.revisionNumber ?? 0) + 1,
        createdBy: command.actorId,
        occurredAt,
      });
      if (latest && document.validatedRevisionId === latest.id) {
        latest.markReplaced(occurredAt);
        await this.revisionRepository.save(latest);
        document.clearValidation(occurredAt);
        supersededValidatedRevision = true;
      }
    }

    target.attachDocument({
      documentId: verified.documentId,
      documentVersionId: verified.documentVersionId,
      documentChecksum: verified.documentChecksum,
      documentFileName: verified.documentFileName,
      documentMimeType: verified.documentMimeType,
      expiresAt: command.expiresAt,
      officialTemplateId: command.officialTemplateId,
      formDataSnapshot: command.formDataSnapshot,
      occurredAt,
    });
    target.submitForReview(occurredAt);

    if (target === latest) {
      await this.revisionRepository.save(target);
    } else {
      await this.revisionRepository.create(target);
    }
    await this.documentRepository.save(document);

    await this.statusRecalculation.recompute({ organizationId: command.organizationId, dossierId: document.administrativeDossierId });
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: supersededValidatedRevision ? "ADMINISTRATIVE_DOCUMENT_REPLACED" : "ADMINISTRATIVE_DOCUMENT_REVISION_CREATED",
      resourceType: "ADMINISTRATIVE_DOCUMENT_REVISION",
      resourceId: target.id,
    });

    const allRevisions = await this.revisionRepository.listByDocument({ organizationId: command.organizationId, administrativeDocumentId: document.id });
    return toAdministrativeDocumentSummary(document, allRevisions);
  }
}

export type ValidateAdministrativeDocumentCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  administrativeDocumentId: string;
  revisionId: string;
}>;

/** Mission §21 — la révision EXACTE est toujours explicite, jamais "la dernière" déduite ici. */
@Injectable()
export class ValidateAdministrativeDocumentUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ADMINISTRATIVE_DOCUMENT_REPOSITORY) private readonly documentRepository: AdministrativeDocumentRepository,
    @Inject(ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY) private readonly revisionRepository: AdministrativeDocumentRevisionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    private readonly statusRecalculation: AdministrativeDossierRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ValidateAdministrativeDocumentCommand): Promise<AdministrativeDocumentSummary> {
    const document = await this.documentRepository.findById({ organizationId: command.organizationId, documentId: command.administrativeDocumentId });
    if (!document) {
      throw new AdministrativeDocumentNotFoundError();
    }

    await this.accessService.assertTenderAccess({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: document.tenderId,
      permission: ClientPermission.ValidateAdministrativeDocuments,
    });

    const revision = await this.revisionRepository.findById({ organizationId: command.organizationId, revisionId: command.revisionId });
    if (!revision || revision.administrativeDocumentId !== document.id) {
      throw new AdministrativeDocumentRevisionNotFoundError();
    }
    if (!revision.hasAttachedFile) {
      throw new AdministrativeDocumentNotReadyForValidationError("no file has been attached to this revision yet");
    }

    const occurredAt = this.clock.now();
    revision.validate(occurredAt);
    document.markValidated({ revisionId: revision.id, validatedBy: command.actorId, occurredAt });

    await this.revisionRepository.save(revision);
    await this.documentRepository.save(document);
    await this.statusRecalculation.recompute({ organizationId: command.organizationId, dossierId: document.administrativeDossierId });
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "ADMINISTRATIVE_DOCUMENT_VALIDATED",
      resourceType: "ADMINISTRATIVE_DOCUMENT_REVISION",
      resourceId: revision.id,
    });

    const revisions = await this.revisionRepository.listByDocument({ organizationId: command.organizationId, administrativeDocumentId: document.id });
    return toAdministrativeDocumentSummary(document, revisions);
  }
}

export type RejectAdministrativeDocumentCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  administrativeDocumentId: string;
  revisionId: string;
}>;

@Injectable()
export class RejectAdministrativeDocumentUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ADMINISTRATIVE_DOCUMENT_REPOSITORY) private readonly documentRepository: AdministrativeDocumentRepository,
    @Inject(ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY) private readonly revisionRepository: AdministrativeDocumentRevisionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    private readonly statusRecalculation: AdministrativeDossierRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RejectAdministrativeDocumentCommand): Promise<AdministrativeDocumentSummary> {
    const document = await this.documentRepository.findById({ organizationId: command.organizationId, documentId: command.administrativeDocumentId });
    if (!document) {
      throw new AdministrativeDocumentNotFoundError();
    }

    await this.accessService.assertTenderAccess({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: document.tenderId,
      permission: ClientPermission.ValidateAdministrativeDocuments,
    });

    const revision = await this.revisionRepository.findById({ organizationId: command.organizationId, revisionId: command.revisionId });
    if (!revision || revision.administrativeDocumentId !== document.id) {
      throw new AdministrativeDocumentRevisionNotFoundError();
    }

    const occurredAt = this.clock.now();
    revision.reject(occurredAt);
    await this.revisionRepository.save(revision);
    await this.statusRecalculation.recompute({ organizationId: command.organizationId, dossierId: document.administrativeDossierId });
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "ADMINISTRATIVE_DOCUMENT_REJECTED",
      resourceType: "ADMINISTRATIVE_DOCUMENT_REVISION",
      resourceId: revision.id,
    });

    const revisions = await this.revisionRepository.listByDocument({ organizationId: command.organizationId, administrativeDocumentId: document.id });
    return toAdministrativeDocumentSummary(document, revisions);
  }
}

export type GetAdministrativeDocumentQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; administrativeDocumentId: string }>;

@Injectable()
export class GetAdministrativeDocumentUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ADMINISTRATIVE_DOCUMENT_REPOSITORY) private readonly documentRepository: AdministrativeDocumentRepository,
    @Inject(ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY) private readonly revisionRepository: AdministrativeDocumentRevisionRepository,
  ) {}

  async execute(query: GetAdministrativeDocumentQuery): Promise<AdministrativeDocumentSummary> {
    const document = await this.documentRepository.findById({ organizationId: query.organizationId, documentId: query.administrativeDocumentId });
    if (!document) {
      throw new AdministrativeDocumentNotFoundError();
    }

    await this.accessService.assertTenderAccess({
      organizationId: query.organizationId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      tenderId: document.tenderId,
      permission: ClientPermission.ReadAdministrativeDossier,
    });

    const revisions = await this.revisionRepository.listByDocument({ organizationId: query.organizationId, administrativeDocumentId: document.id });
    return toAdministrativeDocumentSummary(document, revisions);
  }
}
