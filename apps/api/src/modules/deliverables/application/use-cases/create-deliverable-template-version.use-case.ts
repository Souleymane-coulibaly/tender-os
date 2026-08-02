import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { validateDeliverableTemplateSections } from "../../domain/deliverable-template-section-config";
import { DeliverableTemplateVersion } from "../../domain/deliverable-template-version.entity";
import { DeliverablePermission, roleHasDeliverablePermission } from "../../domain/deliverable-permission";
import { DeliverablePermissionMissingError, DeliverableTemplateNotFoundError } from "../../domain/errors";
import { toDeliverableTemplateVersionSummary, type DeliverableTemplateVersionSummary } from "../dtos";
import { DELIVERABLE_TEMPLATE_REPOSITORY, type DeliverableTemplateRepository } from "../ports/deliverable-template.repository";

export type CreateDeliverableTemplateVersionCommand = Readonly<{
  organizationId: string;
  actorRole: string;
  createdBy: string;
  deliverableTemplateId: string;
  sections: unknown;
}>;

@Injectable()
export class CreateDeliverableTemplateVersionUseCase {
  constructor(
    @Inject(DELIVERABLE_TEMPLATE_REPOSITORY) private readonly repository: DeliverableTemplateRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateDeliverableTemplateVersionCommand): Promise<DeliverableTemplateVersionSummary> {
    if (!roleHasDeliverablePermission(command.actorRole, DeliverablePermission.ManageDeliverableTemplates)) {
      throw new DeliverablePermissionMissingError();
    }

    const found = await this.repository.findById({ organizationId: command.organizationId, deliverableTemplateId: command.deliverableTemplateId });
    if (!found) {
      throw new DeliverableTemplateNotFoundError();
    }

    const existingVersions = await this.repository.listVersions({ organizationId: command.organizationId, deliverableTemplateId: command.deliverableTemplateId });
    const nextVersionNumber = existingVersions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
    const sections = validateDeliverableTemplateSections(command.sections);

    const version = DeliverableTemplateVersion.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      deliverableTemplateId: command.deliverableTemplateId,
      version: nextVersionNumber,
      sections,
      createdBy: command.createdBy,
      occurredAt: this.clock.now(),
    });

    await this.repository.createVersion(version);

    return toDeliverableTemplateVersionSummary(version);
  }
}
