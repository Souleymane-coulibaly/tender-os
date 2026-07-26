import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { OrganizationNotFoundError } from "../../domain/errors";
import { OrganizationId } from "../../domain/organization-id.value-object";
import { toOrganizationSummary, type OrganizationSummary } from "../dtos";
import { ORGANIZATION_REPOSITORY, type OrganizationRepository } from "../ports/organization.repository";

export type SuspendOrganizationCommand = Readonly<{
  id: string;
}>;

export type SuspendOrganizationResult = OrganizationSummary;

@Injectable()
export class SuspendOrganizationUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizationRepository: OrganizationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SuspendOrganizationCommand): Promise<SuspendOrganizationResult> {
    const organization = await this.organizationRepository.findById(OrganizationId.from(command.id));

    if (!organization) {
      throw new OrganizationNotFoundError();
    }

    organization.suspend(this.clock.now());

    await this.organizationRepository.save(organization);

    return toOrganizationSummary(organization);
  }
}
