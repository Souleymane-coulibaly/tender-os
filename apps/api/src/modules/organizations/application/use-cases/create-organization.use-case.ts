import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { OrganizationSlugAlreadyTakenError } from "../../domain/errors";
import { Organization, type OrganizationSettings } from "../../domain/organization.aggregate";
import { OrganizationId } from "../../domain/organization-id.value-object";
import { OrganizationSlug } from "../../domain/organization-slug.value-object";
import { toOrganizationSummary, type OrganizationSummary } from "../dtos";
import { ORGANIZATION_REPOSITORY, type OrganizationRepository } from "../ports/organization.repository";

export type CreateOrganizationCommand = Readonly<{
  name: string;
  slug: string;
  legalName?: string | undefined;
  registrationNumber?: string | undefined;
  countryCode?: string | undefined;
  defaultCurrency?: string | undefined;
  defaultTimezone: string;
  settings?: OrganizationSettings | undefined;
}>;

export type CreateOrganizationResult = OrganizationSummary;

@Injectable()
export class CreateOrganizationUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizationRepository: OrganizationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateOrganizationCommand): Promise<CreateOrganizationResult> {
    const slug = OrganizationSlug.create(command.slug);

    const existing = await this.organizationRepository.findBySlug(slug);

    if (existing) {
      throw new OrganizationSlugAlreadyTakenError();
    }

    const occurredAt = this.clock.now();

    const organization = Organization.create({
      id: OrganizationId.from(this.idGenerator.generate()),
      name: command.name,
      slug,
      legalName: command.legalName,
      registrationNumber: command.registrationNumber,
      countryCode: command.countryCode,
      defaultCurrency: command.defaultCurrency ?? "EUR",
      defaultTimezone: command.defaultTimezone,
      settings: command.settings,
      occurredAt,
    });

    await this.organizationRepository.save(organization);

    return toOrganizationSummary(organization);
  }
}
