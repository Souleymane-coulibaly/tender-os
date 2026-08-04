import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { ComplianceMatrixEntry } from "../../domain/compliance-matrix-entry.aggregate";
import type { ComplianceCoverageStatus, Criticality } from "../../domain/compliance-coverage-status";
import { ComplianceMatrixEntryNotFoundError } from "../../domain/errors";
import { toComplianceMatrixEntrySummary, type ComplianceMatrixEntrySummary } from "../dtos-overlay";
import { COMPLIANCE_MATRIX_ENTRY_REPOSITORY, type ComplianceMatrixEntryRepository } from "../ports/compliance-matrix-entry.repository";
import { DeliverableAccessService } from "../services/deliverable-access.service";
import { DeliverableStatusRecalculationService } from "../services/deliverable-status-recalculation.service";

export type CreateComplianceMatrixEntryCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  deliverableId: string;
  requirementId?: string | undefined;
  source: string;
  mandatory: boolean;
  criticality: Criticality;
}>;

/** Mission Sprint 8A.1 §14 — matrice de conformité : overlay léger, chaque entrée créée/éditée
 *  directement (aucune révision/relecture séparée, décision de portée). */
@Injectable()
export class CreateComplianceMatrixEntryUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(COMPLIANCE_MATRIX_ENTRY_REPOSITORY) private readonly repository: ComplianceMatrixEntryRepository,
    private readonly statusRecalculation: DeliverableStatusRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateComplianceMatrixEntryCommand): Promise<ComplianceMatrixEntrySummary> {
    const { deliverable } = await this.accessService.loadDeliverable({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      deliverableId: command.deliverableId,
      permission: ClientPermission.ManageDeliverable,
    });
    const existing = await this.repository.listByDeliverable({ organizationId: command.organizationId, deliverableId: deliverable.id });
    const entry = ComplianceMatrixEntry.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      deliverableId: deliverable.id,
      requirementId: command.requirementId,
      source: command.source,
      mandatory: command.mandatory,
      criticality: command.criticality,
      order: existing.length,
      createdBy: command.actorId,
      occurredAt: this.clock.now(),
    });
    await this.repository.create(entry);
    await this.statusRecalculation.recomputeOverlayDeliverable({ organizationId: command.organizationId, deliverableId: deliverable.id });
    return toComplianceMatrixEntrySummary(entry);
  }
}

export type UpdateComplianceMatrixEntryCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  deliverableId: string;
  entryId: string;
  response?: string | undefined;
  deliverableSectionRef?: string | undefined;
  proofReference?: string | undefined;
  coverageStatus?: ComplianceCoverageStatus | undefined;
}>;

@Injectable()
export class UpdateComplianceMatrixEntryUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(COMPLIANCE_MATRIX_ENTRY_REPOSITORY) private readonly repository: ComplianceMatrixEntryRepository,
    private readonly statusRecalculation: DeliverableStatusRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateComplianceMatrixEntryCommand): Promise<ComplianceMatrixEntrySummary> {
    const { deliverable } = await this.accessService.loadDeliverable({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      deliverableId: command.deliverableId,
      permission: ClientPermission.ManageDeliverable,
    });
    const entry = await this.repository.findById({ organizationId: command.organizationId, entryId: command.entryId });
    if (!entry || entry.deliverableId !== deliverable.id) {
      throw new ComplianceMatrixEntryNotFoundError();
    }
    entry.update({
      response: command.response,
      deliverableSectionRef: command.deliverableSectionRef,
      proofReference: command.proofReference,
      coverageStatus: command.coverageStatus,
      occurredAt: this.clock.now(),
    });
    await this.repository.save(entry);
    await this.statusRecalculation.recomputeOverlayDeliverable({ organizationId: command.organizationId, deliverableId: deliverable.id });
    return toComplianceMatrixEntrySummary(entry);
  }
}

export type ValidateComplianceMatrixEntryCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; deliverableId: string; entryId: string }>;

/** Mission §17 — validation d'une ligne de matrice réservée à `ValidateDeliverable` (même palier
 *  que la revue de section). */
@Injectable()
export class ValidateComplianceMatrixEntryUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(COMPLIANCE_MATRIX_ENTRY_REPOSITORY) private readonly repository: ComplianceMatrixEntryRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ValidateComplianceMatrixEntryCommand): Promise<ComplianceMatrixEntrySummary> {
    const { deliverable } = await this.accessService.loadDeliverable({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      deliverableId: command.deliverableId,
      permission: ClientPermission.ValidateDeliverable,
    });
    const entry = await this.repository.findById({ organizationId: command.organizationId, entryId: command.entryId });
    if (!entry || entry.deliverableId !== deliverable.id) {
      throw new ComplianceMatrixEntryNotFoundError();
    }
    entry.markValidated({ validatedBy: command.actorId, occurredAt: this.clock.now() });
    await this.repository.save(entry);
    return toComplianceMatrixEntrySummary(entry);
  }
}

export type ListComplianceMatrixEntriesQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; deliverableId: string }>;

@Injectable()
export class ListComplianceMatrixEntriesUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(COMPLIANCE_MATRIX_ENTRY_REPOSITORY) private readonly repository: ComplianceMatrixEntryRepository,
  ) {}

  async execute(query: ListComplianceMatrixEntriesQuery): Promise<readonly ComplianceMatrixEntrySummary[]> {
    const { deliverable } = await this.accessService.loadDeliverable({
      organizationId: query.organizationId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      deliverableId: query.deliverableId,
      permission: ClientPermission.ReadDeliverable,
    });
    const entries = await this.repository.listByDeliverable({ organizationId: query.organizationId, deliverableId: deliverable.id });
    return [...entries].sort((a, b) => a.order - b.order).map(toComplianceMatrixEntrySummary);
  }
}
