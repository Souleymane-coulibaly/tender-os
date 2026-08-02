import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { GetDocumentUseCase } from "../../../documents";
import type { ChecklistPieceStatus } from "../../domain/checklist-piece-status";
import { ChecklistPieceEntry } from "../../domain/checklist-piece-entry.aggregate";
import { ChecklistPieceEntryNotFoundError } from "../../domain/errors";
import { toChecklistPieceEntrySummary, type ChecklistPieceEntrySummary } from "../dtos-overlay";
import { CHECKLIST_PIECE_ENTRY_REPOSITORY, type ChecklistPieceEntryRepository } from "../ports/checklist-piece-entry.repository";
import { DeliverableAccessService } from "../services/deliverable-access.service";
import { verifyAttachableDocument } from "../services/verify-attachable-document";

export type CreateChecklistPieceEntryCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  deliverableId: string;
  name: string;
  source?: string | undefined;
  mandatory: boolean;
  format?: string | undefined;
  signatureRequired?: boolean | undefined;
}>;

/** Mission Sprint 8A.1 §14 — checklist des pièces à fournir : overlay léger. */
@Injectable()
export class CreateChecklistPieceEntryUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(CHECKLIST_PIECE_ENTRY_REPOSITORY) private readonly repository: ChecklistPieceEntryRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateChecklistPieceEntryCommand): Promise<ChecklistPieceEntrySummary> {
    const { deliverable } = await this.accessService.loadDeliverable({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      deliverableId: command.deliverableId,
      permission: ClientPermission.ManageDeliverable,
    });
    const existing = await this.repository.listByDeliverable({ organizationId: command.organizationId, deliverableId: deliverable.id });
    const entry = ChecklistPieceEntry.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      deliverableId: deliverable.id,
      name: command.name,
      source: command.source,
      mandatory: command.mandatory,
      format: command.format,
      signatureRequired: command.signatureRequired,
      order: existing.length,
      createdBy: command.actorId,
      occurredAt: this.clock.now(),
    });
    await this.repository.create(entry);
    return toChecklistPieceEntrySummary(entry);
  }
}

export type UpdateChecklistPieceEntryCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  deliverableId: string;
  entryId: string;
  documentId?: string | undefined;
  version?: string | undefined;
  expiresAt?: Date | undefined;
  status?: ChecklistPieceStatus | undefined;
  responsibleUserId?: string | undefined;
}>;

@Injectable()
export class UpdateChecklistPieceEntryUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(CHECKLIST_PIECE_ENTRY_REPOSITORY) private readonly repository: ChecklistPieceEntryRepository,
    private readonly getDocumentUseCase: GetDocumentUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateChecklistPieceEntryCommand): Promise<ChecklistPieceEntrySummary> {
    const { deliverable } = await this.accessService.loadDeliverable({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      deliverableId: command.deliverableId,
      permission: ClientPermission.ManageDeliverable,
    });
    const entry = await this.repository.findById({ organizationId: command.organizationId, entryId: command.entryId });
    if (!entry || entry.deliverableId !== deliverable.id) {
      throw new ChecklistPieceEntryNotFoundError();
    }
    const occurredAt = this.clock.now();
    if (command.documentId) {
      // Correctif audit Codex P1-003 — jamais un `documentId` associé sans vérification préalable
      // (existence, organisation, accès acteur) ; la référence de version figée vient TOUJOURS du
      // document vérifié, jamais d'une valeur fournie par le client.
      const verified = await verifyAttachableDocument(this.getDocumentUseCase, {
        organizationId: command.organizationId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        documentId: command.documentId,
      });
      entry.attachDocument({
        documentId: verified.documentId,
        version: command.version,
        documentVersionId: verified.documentVersionId,
        documentChecksum: verified.documentChecksum,
        documentFileName: verified.documentFileName,
        documentMimeType: verified.documentMimeType,
        expiresAt: command.expiresAt,
        occurredAt,
      });
    }
    if (command.status) {
      entry.changeStatus({ status: command.status, occurredAt });
    }
    if (command.responsibleUserId) {
      entry.assignResponsible({ responsibleUserId: command.responsibleUserId, occurredAt });
    }
    await this.repository.save(entry);
    return toChecklistPieceEntrySummary(entry);
  }
}

export type ListChecklistPieceEntriesQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; deliverableId: string }>;

@Injectable()
export class ListChecklistPieceEntriesUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(CHECKLIST_PIECE_ENTRY_REPOSITORY) private readonly repository: ChecklistPieceEntryRepository,
  ) {}

  async execute(query: ListChecklistPieceEntriesQuery): Promise<readonly ChecklistPieceEntrySummary[]> {
    const { deliverable } = await this.accessService.loadDeliverable({
      organizationId: query.organizationId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      deliverableId: query.deliverableId,
      permission: ClientPermission.ReadDeliverable,
    });
    const entries = await this.repository.listByDeliverable({ organizationId: query.organizationId, deliverableId: deliverable.id });
    return [...entries].sort((a, b) => a.order - b.order).map(toChecklistPieceEntrySummary);
  }
}
