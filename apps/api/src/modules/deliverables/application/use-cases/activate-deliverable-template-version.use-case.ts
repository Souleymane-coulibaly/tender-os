import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { DeliverablePermission, roleHasDeliverablePermission } from "../../domain/deliverable-permission";
import { DeliverablePermissionMissingError, DeliverableTemplateVersionNotFoundError } from "../../domain/errors";
import { toDeliverableTemplateVersionSummary, type DeliverableTemplateVersionSummary } from "../dtos";
import { DELIVERABLE_TEMPLATE_REPOSITORY, type DeliverableTemplateRepository } from "../ports/deliverable-template.repository";

export type ActivateDeliverableTemplateVersionCommand = Readonly<{
  organizationId: string;
  actorRole: string;
  deliverableTemplateId: string;
  versionId: string;
}>;

/** Mission §5/§18 — activation atomique (archive l'éventuelle version ACTIVE + active la nouvelle
 *  dans la même transaction courte, côté repository) — testé sous activation concurrente. */
@Injectable()
export class ActivateDeliverableTemplateVersionUseCase {
  constructor(
    @Inject(DELIVERABLE_TEMPLATE_REPOSITORY) private readonly repository: DeliverableTemplateRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ActivateDeliverableTemplateVersionCommand): Promise<DeliverableTemplateVersionSummary> {
    if (!roleHasDeliverablePermission(command.actorRole, DeliverablePermission.ManageDeliverableTemplates)) {
      throw new DeliverablePermissionMissingError();
    }

    const version = await this.repository.findVersionById({ organizationId: command.organizationId, versionId: command.versionId });
    if (!version || version.deliverableTemplateId !== command.deliverableTemplateId) {
      throw new DeliverableTemplateVersionNotFoundError();
    }

    const activated = await this.repository.activateAtomically({
      organizationId: command.organizationId,
      deliverableTemplateId: command.deliverableTemplateId,
      versionId: command.versionId,
      occurredAt: this.clock.now(),
    });

    return toDeliverableTemplateVersionSummary(activated);
  }
}
