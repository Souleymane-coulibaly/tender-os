import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { validateDeliverableTemplateSections } from "../../domain/deliverable-template-section-config";
import { DeliverableTemplate } from "../../domain/deliverable-template.aggregate";
import { DeliverableTemplateVersion } from "../../domain/deliverable-template-version.entity";
import type { DeliverableType } from "../../domain/deliverable-type";
import { DeliverablePermission, roleHasDeliverablePermission } from "../../domain/deliverable-permission";
import { DeliverablePermissionMissingError, SystemScopeNotTenantCreatableError } from "../../domain/errors";
import { isTenantCreatableScopeLevel, type ScopeLevel } from "../../domain/scope-level";
import { toDeliverableTemplateSummary, type DeliverableTemplateSummary } from "../dtos";
import { DELIVERABLE_TEMPLATE_REPOSITORY, type DeliverableTemplateRepository } from "../ports/deliverable-template.repository";

export type CreateDeliverableTemplateCommand = Readonly<{
  organizationId: string;
  actorRole: string;
  createdBy: string;
  scopeLevel: ScopeLevel;
  clientAccountId?: string | undefined;
  tenderId?: string | undefined;
  documentType: DeliverableType;
  name: string;
  description?: string | undefined;
  note?: string | undefined;
  sections: unknown;
}>;

/** Mission Sprint 8A.1 §5/§17 — gestion des templates réservée à OWNER/ORGANIZATION_ADMIN. Crée le
 *  template ET sa première version (DRAFT) atomiquement. */
@Injectable()
export class CreateDeliverableTemplateUseCase {
  constructor(
    @Inject(DELIVERABLE_TEMPLATE_REPOSITORY) private readonly repository: DeliverableTemplateRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateDeliverableTemplateCommand): Promise<DeliverableTemplateSummary> {
    if (!roleHasDeliverablePermission(command.actorRole, DeliverablePermission.ManageDeliverableTemplates)) {
      throw new DeliverablePermissionMissingError();
    }
    // Correctif audit Codex P1-004 — TENDEROS est une ressource système, jamais créable via l'API
    // tenant (seedée hors du périmètre applicatif) — refusé même pour OWNER/ORGANIZATION_ADMIN.
    if (!isTenantCreatableScopeLevel(command.scopeLevel)) {
      throw new SystemScopeNotTenantCreatableError();
    }

    const sections = validateDeliverableTemplateSections(command.sections);
    const occurredAt = this.clock.now();

    const template = DeliverableTemplate.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      scopeLevel: command.scopeLevel,
      clientAccountId: command.clientAccountId,
      tenderId: command.tenderId,
      documentType: command.documentType,
      name: command.name,
      description: command.description,
      note: command.note,
      createdBy: command.createdBy,
      occurredAt,
    });

    const version = DeliverableTemplateVersion.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      deliverableTemplateId: template.id,
      version: 1,
      sections,
      createdBy: command.createdBy,
      occurredAt,
    });

    await this.repository.createWithFirstVersion({ template, version });

    return toDeliverableTemplateSummary(template, { versions: [version] });
  }
}
