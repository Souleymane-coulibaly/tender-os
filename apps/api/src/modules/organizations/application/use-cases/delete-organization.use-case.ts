import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { OrganizationNotFoundError } from "../../domain/errors";
import { OrganizationId } from "../../domain/organization-id.value-object";
import { ORGANIZATION_REPOSITORY, type OrganizationRepository } from "../ports/organization.repository";

export type DeleteOrganizationCommand = Readonly<{
  id: string;
}>;

@Injectable()
export class DeleteOrganizationUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizationRepository: OrganizationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: DeleteOrganizationCommand): Promise<void> {
    const organization = await this.organizationRepository.findById(OrganizationId.from(command.id));

    if (!organization) {
      throw new OrganizationNotFoundError();
    }

    organization.markDeleted(this.clock.now());

    await this.organizationRepository.save(organization);
  }
}
