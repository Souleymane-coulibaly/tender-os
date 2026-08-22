import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ENTITLEMENT_SERVICE, type EntitlementService } from "../../../billing";
import { ClientPermission } from "../../../client-portfolio";
import type { AdministrativeDocumentType } from "../../domain/administrative-document-type";
import { AdministrativeRequirement } from "../../domain/administrative-requirement.aggregate";
import { AdministrativeRequirementOrigin } from "../../domain/administrative-requirement-origin";
import { AdministrativeRequirementNotFoundError } from "../../domain/errors";
import { AdministrativeRequirementSummary, toAdministrativeRequirementSummary } from "../dtos";
import { ADMINISTRATIVE_REQUIREMENT_REPOSITORY, type AdministrativeRequirementRepository } from "../ports/administrative-requirement.repository";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import { AdministrativeDossierRecalculationService } from "../services/administrative-dossier-recalculation.service";
import { ADMINISTRATIVE_DOSSIER_REPOSITORY, type AdministrativeDossierRepository } from "../ports/administrative-dossier.repository";

export type CreateAdministrativeRequirementCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  title: string;
  description?: string | undefined;
  requirementType: string;
  expectedDocumentType: AdministrativeDocumentType;
  required: boolean;
  applicable?: boolean | undefined;
  dueDate?: Date | undefined;
  validityRule?: string | undefined;
  signatureRequired?: boolean | undefined;
}>;

/** Mission Sprint 8C §8 — une exigence saisie manuellement par un Bid Manager (`MANUAL`). Les
 *  origines `DCE_ANALYSIS`/`BUYER_TEMPLATE`/`TENDEROS_RULE` seront câblées par une phase ultérieure
 *  (intégration Analysis/DCE), pas encore construites ici. */
@Injectable()
export class CreateAdministrativeRequirementUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ADMINISTRATIVE_REQUIREMENT_REPOSITORY) private readonly repository: AdministrativeRequirementRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(ENTITLEMENT_SERVICE) private readonly entitlementService: EntitlementService,
  ) {}

  async execute(command: CreateAdministrativeRequirementCommand): Promise<AdministrativeRequirementSummary> {
    await this.accessService.assertTenderAccess({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: command.tenderId,
      permission: ClientPermission.ManageAdministrativeDossier,
    });

    // Checkpoint TENDEROS-2.1-P2.3-E1.3, mission §20 — voir `EnsureAdministrativeDossierUseCase`
    // (même justification : point d'entrée indépendant, aucun dossier préexistant requis).
    return this.entitlementService.runTenderOperationEntitled(
      { organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, occurredAt: this.clock.now() },
      async () => this.executeEntitled(command),
    );
  }

  private async executeEntitled(command: CreateAdministrativeRequirementCommand): Promise<AdministrativeRequirementSummary> {
    const occurredAt = this.clock.now();
    const requirement = AdministrativeRequirement.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      title: command.title,
      description: command.description,
      requirementType: command.requirementType,
      expectedDocumentType: command.expectedDocumentType,
      required: command.required,
      applicable: command.applicable,
      dueDate: command.dueDate,
      validityRule: command.validityRule,
      signatureRequired: command.signatureRequired,
      origin: AdministrativeRequirementOrigin.Manual,
      createdBy: command.actorId,
      occurredAt,
    });
    await this.repository.create(requirement);
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "ADMINISTRATIVE_REQUIREMENT_CREATED",
      resourceType: "ADMINISTRATIVE_REQUIREMENT",
      resourceId: requirement.id,
    });
    return toAdministrativeRequirementSummary(requirement);
  }
}

export type UpdateAdministrativeRequirementCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  requirementId: string;
  action?: "CONFIRM" | "REJECT" | "NOT_APPLICABLE" | undefined;
  title?: string | undefined;
  description?: string | undefined;
  dueDate?: Date | undefined;
  validityRule?: string | undefined;
  required?: boolean | undefined;
  signatureRequired?: boolean | undefined;
  documentId?: string | undefined;
  unmatchDocument?: boolean | undefined;
}>;

/** Mission §8/§22 — une décision (`action`) exige `ValidateAdministrativeDossier` ("règle stricte",
 *  même palier que `ValidateDeliverable`) ; une simple édition ou un rapprochement de document
 *  n'exige que `ManageAdministrativeDossier`. */
@Injectable()
export class UpdateAdministrativeRequirementUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ADMINISTRATIVE_REQUIREMENT_REPOSITORY) private readonly repository: AdministrativeRequirementRepository,
    @Inject(ADMINISTRATIVE_DOSSIER_REPOSITORY) private readonly dossierRepository: AdministrativeDossierRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    private readonly statusRecalculation: AdministrativeDossierRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateAdministrativeRequirementCommand): Promise<AdministrativeRequirementSummary> {
    const requirement = await this.repository.findById({ organizationId: command.organizationId, requirementId: command.requirementId });
    if (!requirement) {
      throw new AdministrativeRequirementNotFoundError();
    }

    await this.accessService.assertTenderAccess({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: requirement.tenderId,
      permission: command.action ? ClientPermission.ValidateAdministrativeDossier : ClientPermission.ManageAdministrativeDossier,
    });

    const occurredAt = this.clock.now();
    if (command.action === "CONFIRM") {
      requirement.confirm({ validatedBy: command.actorId, occurredAt });
    } else if (command.action === "REJECT") {
      requirement.reject({ validatedBy: command.actorId, occurredAt });
    } else if (command.action === "NOT_APPLICABLE") {
      requirement.markNotApplicable({ validatedBy: command.actorId, occurredAt });
    }

    if (command.title !== undefined || command.description !== undefined || command.dueDate !== undefined || command.validityRule !== undefined || command.required !== undefined || command.signatureRequired !== undefined) {
      requirement.edit({
        title: command.title,
        description: command.description,
        dueDate: command.dueDate,
        validityRule: command.validityRule,
        required: command.required,
        signatureRequired: command.signatureRequired,
        occurredAt,
      });
    }
    if (command.documentId !== undefined) {
      requirement.matchDocument({ documentId: command.documentId, occurredAt });
    }
    if (command.unmatchDocument) {
      requirement.unmatchDocument({ occurredAt });
    }

    await this.repository.save(requirement);

    if (command.action) {
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: `ADMINISTRATIVE_REQUIREMENT_${command.action}`,
        resourceType: "ADMINISTRATIVE_REQUIREMENT",
        resourceId: requirement.id,
      });
    }

    const dossier = await this.dossierRepository.findByTenderId({ organizationId: command.organizationId, tenderId: requirement.tenderId });
    if (dossier) {
      await this.statusRecalculation.recompute({ organizationId: command.organizationId, dossierId: dossier.id });
    }

    return toAdministrativeRequirementSummary(requirement);
  }
}

export type ListAdministrativeRequirementsQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

@Injectable()
export class ListAdministrativeRequirementsUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ADMINISTRATIVE_REQUIREMENT_REPOSITORY) private readonly repository: AdministrativeRequirementRepository,
  ) {}

  async execute(query: ListAdministrativeRequirementsQuery): Promise<readonly AdministrativeRequirementSummary[]> {
    await this.accessService.assertTenderAccess({
      organizationId: query.organizationId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      tenderId: query.tenderId,
      permission: ClientPermission.ReadAdministrativeDossier,
    });
    const requirements = await this.repository.listByTender({ organizationId: query.organizationId, tenderId: query.tenderId });
    return requirements.map(toAdministrativeRequirementSummary);
  }
}
