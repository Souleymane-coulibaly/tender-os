import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { OrganizationNotFoundError } from "../../domain/errors";
import type { OrganizationSettings } from "../../domain/organization.aggregate";
import { OrganizationId } from "../../domain/organization-id.value-object";
import { toOrganizationSummary, type OrganizationSummary } from "../dtos";
import { ORGANIZATION_REPOSITORY, type OrganizationRepository } from "../ports/organization.repository";

export type UpdateOrganizationCommand = Readonly<{
  id: string;
  name?: string | undefined;
  legalName?: string | undefined;
  registrationNumber?: string | undefined;
  countryCode?: string | undefined;
  defaultCurrency?: string | undefined;
  defaultTimezone?: string | undefined;
  settings?: OrganizationSettings | undefined;
}>;

export type UpdateOrganizationResult = OrganizationSummary;

@Injectable()
export class UpdateOrganizationUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizationRepository: OrganizationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateOrganizationCommand): Promise<UpdateOrganizationResult> {
    const organization = await this.organizationRepository.findById(OrganizationId.from(command.id));

    if (!organization) {
      throw new OrganizationNotFoundError();
    }

    organization.updateProfile(
      {
        name: command.name,
        legalName: command.legalName,
        registrationNumber: command.registrationNumber,
        countryCode: command.countryCode,
        defaultCurrency: command.defaultCurrency,
        defaultTimezone: command.defaultTimezone,
        settings: command.settings,
      },
      this.clock.now(),
    );

    await this.organizationRepository.save(organization);

    return toOrganizationSummary(organization);
  }
}
