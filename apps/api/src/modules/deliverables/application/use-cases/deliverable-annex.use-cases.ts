import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { GetDocumentUseCase } from "../../../documents";
import { DeliverableAnnex } from "../../domain/deliverable-annex.aggregate";
import { DeliverableAnnexNotFoundError } from "../../domain/errors";
import { toDeliverableAnnexSummary, type DeliverableAnnexSummary } from "../dtos-overlay";
import { DELIVERABLE_ANNEX_REPOSITORY, type DeliverableAnnexRepository } from "../ports/deliverable-annex.repository";
import { DeliverableAccessService } from "../services/deliverable-access.service";
import { verifyAttachableDocument, type AttachableDocumentReference } from "../services/verify-attachable-document";

export type CreateDeliverableAnnexCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  deliverableId: string;
  label: string;
  source?: string | undefined;
  documentId?: string | undefined;
  version?: string | undefined;
}>;

/** Mission Sprint 8A.1 §14 — annexes (références/CV/certifications/fiches techniques/organigrammes/
 *  plannings/preuves) : overlay léger, ordre/version/source/statut conservés. */
@Injectable()
export class CreateDeliverableAnnexUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(DELIVERABLE_ANNEX_REPOSITORY) private readonly repository: DeliverableAnnexRepository,
    private readonly getDocumentUseCase: GetDocumentUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateDeliverableAnnexCommand): Promise<DeliverableAnnexSummary> {
    const { deliverable } = await this.accessService.loadDeliverable({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      deliverableId: command.deliverableId,
      permission: ClientPermission.ManageDeliverable,
    });

    // Correctif audit Codex P1-003 — jamais un `documentId` associé sans vérification préalable.
    let verified: AttachableDocumentReference | undefined;
    if (command.documentId) {
      verified = await verifyAttachableDocument(this.getDocumentUseCase, {
        organizationId: command.organizationId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        documentId: command.documentId,
      });
    }

    const existing = await this.repository.listByDeliverable({ organizationId: command.organizationId, deliverableId: deliverable.id });
    const annex = DeliverableAnnex.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      deliverableId: deliverable.id,
      label: command.label,
      source: command.source,
      documentId: verified?.documentId,
      version: command.version,
      documentVersionId: verified?.documentVersionId,
      documentChecksum: verified?.documentChecksum,
      documentFileName: verified?.documentFileName,
      documentMimeType: verified?.documentMimeType,
      order: existing.length,
      createdBy: command.actorId,
      occurredAt: this.clock.now(),
    });
    await this.repository.create(annex);
    return toDeliverableAnnexSummary(annex);
  }
}

export type UpdateDeliverableAnnexCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  deliverableId: string;
  annexId: string;
  documentId: string;
  version?: string | undefined;
}>;

/** Correctif — seul moyen de faire progresser une annexe hors de PENDING pour une annexe déjà
 *  créée (mission — la création seule, via `CreateDeliverableAnnexCommand.documentId`, ne couvre
 *  que le cas où le document est connu dès la création). Même motif que
 *  `UpdateChecklistPieceEntryUseCase` : `documentId` reste obligatoire ici — attacher un document
 *  vérifié est la SEULE raison d'appeler cet use case, jamais une simple bascule de statut sans
 *  preuve réelle derrière. */
@Injectable()
export class UpdateDeliverableAnnexUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(DELIVERABLE_ANNEX_REPOSITORY) private readonly repository: DeliverableAnnexRepository,
    private readonly getDocumentUseCase: GetDocumentUseCase,
  ) {}

  async execute(command: UpdateDeliverableAnnexCommand): Promise<DeliverableAnnexSummary> {
    const { deliverable } = await this.accessService.loadDeliverable({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      deliverableId: command.deliverableId,
      permission: ClientPermission.ManageDeliverable,
    });

    const annex = await this.repository.findById({ organizationId: command.organizationId, annexId: command.annexId });
    if (!annex || annex.deliverableId !== deliverable.id) {
      throw new DeliverableAnnexNotFoundError();
    }

    // Correctif audit Codex P1-003 — jamais un `documentId` associé sans vérification préalable.
    const verified = await verifyAttachableDocument(this.getDocumentUseCase, {
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      documentId: command.documentId,
    });
    annex.attachDocument({
      documentId: verified.documentId,
      version: command.version,
      documentVersionId: verified.documentVersionId,
      documentChecksum: verified.documentChecksum,
      documentFileName: verified.documentFileName,
      documentMimeType: verified.documentMimeType,
    });
    await this.repository.save(annex);
    return toDeliverableAnnexSummary(annex);
  }
}

export type ListDeliverableAnnexesQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; deliverableId: string }>;

@Injectable()
export class ListDeliverableAnnexesUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(DELIVERABLE_ANNEX_REPOSITORY) private readonly repository: DeliverableAnnexRepository,
  ) {}

  async execute(query: ListDeliverableAnnexesQuery): Promise<readonly DeliverableAnnexSummary[]> {
    const { deliverable } = await this.accessService.loadDeliverable({
      organizationId: query.organizationId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      deliverableId: query.deliverableId,
      permission: ClientPermission.ReadDeliverable,
    });
    const annexes = await this.repository.listByDeliverable({ organizationId: query.organizationId, deliverableId: deliverable.id });
    return [...annexes].sort((a, b) => a.order - b.order).map(toDeliverableAnnexSummary);
  }
}
