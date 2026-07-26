import { Inject, Injectable } from "@nestjs/common";
import { OrganizationNotFoundError } from "../../domain/errors";
import { OrganizationId } from "../../domain/organization-id.value-object";
import { toOrganizationSummary, type OrganizationSummary } from "../dtos";
import { ORGANIZATION_REPOSITORY, type OrganizationRepository } from "../ports/organization.repository";

export type GetOrganizationQuery = Readonly<{
  id: string;
}>;

export type GetOrganizationResult = OrganizationSummary;

@Injectable()
export class GetOrganizationUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(query: GetOrganizationQuery): Promise<GetOrganizationResult> {
    const organization = await this.organizationRepository.findById(OrganizationId.from(query.id));

    if (!organization) {
      throw new OrganizationNotFoundError();
    }

    return toOrganizationSummary(organization);
  }
}
