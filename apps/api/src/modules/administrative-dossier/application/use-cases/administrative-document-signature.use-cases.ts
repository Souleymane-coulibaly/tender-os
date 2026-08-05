import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import type { AdministrativeSignatureMode } from "../../domain/administrative-signature";
import { AdministrativeDocumentNotFoundError } from "../../domain/errors";
import { AdministrativeDocumentSummary, toAdministrativeDocumentSummary } from "../dtos";
import { ADMINISTRATIVE_DOCUMENT_REPOSITORY, type AdministrativeDocumentRepository } from "../ports/administrative-document.repository";
import { ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY, type AdministrativeDocumentRevisionRepository } from "../ports/administrative-document-revision.repository";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";

export type SetAdministrativeDocumentSignatureModeCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; administrativeDocumentId: string; mode: AdministrativeSignatureMode }>;

/** Mission §18 — le SEUL moment où un statut PENDING apparaît (mission "jamais un PENDING
 *  auto-créé lorsqu'aucune signature n'est nécessaire" — toujours en tandem avec un mode requis
 *  explicitement posé ici). */
@Injectable()
export class SetAdministrativeDocumentSignatureModeUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ADMINISTRATIVE_DOCUMENT_REPOSITORY) private readonly documentRepository: AdministrativeDocumentRepository,
    @Inject(ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY) private readonly revisionRepository: AdministrativeDocumentRevisionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SetAdministrativeDocumentSignatureModeCommand): Promise<AdministrativeDocumentSummary> {
    const document = await this.documentRepository.findById({ organizationId: command.organizationId, documentId: command.administrativeDocumentId });
    if (!document) throw new AdministrativeDocumentNotFoundError();

    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: document.tenderId, permission: ClientPermission.ManageAdministrativeDocuments });

    document.setSignatureMode({ mode: command.mode, occurredAt: this.clock.now() });
    await this.documentRepository.save(document);

    const revisions = await this.revisionRepository.listByDocument({ organizationId: command.organizationId, administrativeDocumentId: document.id });
    return toAdministrativeDocumentSummary(document, revisions);
  }
}

export type RecordAdministrativeDocumentSignatureCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; administrativeDocumentId: string }>;

/** Mission §18 — "signature manuelle possible / preuve externe possible" : dispatche selon le mode
 *  déjà posé sur le document (jamais un second choix de mode ici). */
@Injectable()
export class RecordAdministrativeDocumentSignatureUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ADMINISTRATIVE_DOCUMENT_REPOSITORY) private readonly documentRepository: AdministrativeDocumentRepository,
    @Inject(ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY) private readonly revisionRepository: AdministrativeDocumentRevisionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RecordAdministrativeDocumentSignatureCommand): Promise<AdministrativeDocumentSummary> {
    const document = await this.documentRepository.findById({ organizationId: command.organizationId, documentId: command.administrativeDocumentId });
    if (!document) throw new AdministrativeDocumentNotFoundError();

    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: document.tenderId, permission: ClientPermission.ManageAdministrativeDocuments });

    const occurredAt = this.clock.now();
    if (document.signatureMode === "EXTERNAL") {
      document.recordExternalSignatureProof(occurredAt);
    } else {
      document.recordManualSignature(occurredAt);
    }
    await this.documentRepository.save(document);
    await this.auditLogWriter.record({ organizationId: command.organizationId, actorType: "USER", actorId: command.actorId, action: "ADMINISTRATIVE_DOCUMENT_SIGNATURE_RECORDED", resourceType: "ADMINISTRATIVE_DOCUMENT", resourceId: document.id });

    const revisions = await this.revisionRepository.listByDocument({ organizationId: command.organizationId, administrativeDocumentId: document.id });
    return toAdministrativeDocumentSummary(document, revisions);
  }
}

export type RejectAdministrativeDocumentSignatureCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; administrativeDocumentId: string }>;

@Injectable()
export class RejectAdministrativeDocumentSignatureUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ADMINISTRATIVE_DOCUMENT_REPOSITORY) private readonly documentRepository: AdministrativeDocumentRepository,
    @Inject(ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY) private readonly revisionRepository: AdministrativeDocumentRevisionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RejectAdministrativeDocumentSignatureCommand): Promise<AdministrativeDocumentSummary> {
    const document = await this.documentRepository.findById({ organizationId: command.organizationId, documentId: command.administrativeDocumentId });
    if (!document) throw new AdministrativeDocumentNotFoundError();

    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: document.tenderId, permission: ClientPermission.ValidateAdministrativeDocuments });

    document.rejectSignature(this.clock.now());
    await this.documentRepository.save(document);

    const revisions = await this.revisionRepository.listByDocument({ organizationId: command.organizationId, administrativeDocumentId: document.id });
    return toAdministrativeDocumentSummary(document, revisions);
  }
}
