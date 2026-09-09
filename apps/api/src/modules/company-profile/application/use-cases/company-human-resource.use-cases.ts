import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import type { CompanyHumanResourceRecord } from "../dtos";
import { COMPANY_HUMAN_RESOURCE_REPOSITORY, type CompanyHumanResourceRepository, type Patch } from "../ports/company-satellite.repository";
import { CompanyProfileAccessService } from "../services/company-profile-access.service";

export type CreateCompanyHumanResourceCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  actorId: string;
  actorRole: string;
  category: string;
  title: string;
  headcount?: number | undefined;
  qualification?: string | undefined;
  averageExperienceYears?: number | undefined;
  skills?: string | undefined;
  certifications?: string | undefined;
  availabilityNote?: string | undefined;
  location?: string | undefined;
}>;

export type UpdateCompanyHumanResourceCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  humanResourceId: string;
  actorId: string;
  actorRole: string;
  patch: Patch<Omit<CreateCompanyHumanResourceCommand, "organizationId" | "clientAccountId" | "actorId" | "actorRole">> & { status?: string | undefined };
}>;

@Injectable()
export class ListCompanyHumanResourcesUseCase {
  constructor(
    @Inject(COMPANY_HUMAN_RESOURCE_REPOSITORY) private readonly repository: CompanyHumanResourceRepository,
    private readonly accessService: CompanyProfileAccessService,
  ) {}

  async execute(input: { organizationId: string; clientAccountId: string; actorId: string; actorRole: string }): Promise<CompanyHumanResourceRecord[]> {
    await this.accessService.assertClientAccess({ ...input, permission: ClientPermission.ReadCompanyProfile });
    return this.repository.list(input);
  }
}


