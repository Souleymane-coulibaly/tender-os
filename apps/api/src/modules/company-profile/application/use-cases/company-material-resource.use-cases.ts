import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import type { CompanyMaterialResourceRecord } from "../dtos";
import { COMPANY_MATERIAL_RESOURCE_REPOSITORY, type CompanyMaterialResourceRepository, type Patch } from "../ports/company-satellite.repository";
import { CompanyProfileAccessService } from "../services/company-profile-access.service";

export type CreateCompanyMaterialResourceCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  actorId: string;
  actorRole: string;
  category: string;
  name: string;
  description?: string | undefined;
  quantity?: number | undefined;
  characteristics?: string | undefined;
  location?: string | undefined;
  availabilityStatus?: string | undefined;
  ownershipType?: string | undefined;
  documentId?: string | undefined;
}>;

export type UpdateCompanyMaterialResourceCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  materialResourceId: string;
  actorId: string;
  actorRole: string;
  patch: Patch<Omit<CreateCompanyMaterialResourceCommand, "organizationId" | "clientAccountId" | "actorId" | "actorRole">> & { status?: string | undefined };
}>;

@Injectable()
export class ListCompanyMaterialResourcesUseCase {
  constructor(
    @Inject(COMPANY_MATERIAL_RESOURCE_REPOSITORY) private readonly repository: CompanyMaterialResourceRepository,
    private readonly accessService: CompanyProfileAccessService,
  ) {}

  async execute(input: { organizationId: string; clientAccountId: string; actorId: string; actorRole: string }): Promise<CompanyMaterialResourceRecord[]> {
    await this.accessService.assertClientAccess({ ...input, permission: ClientPermission.ReadCompanyProfile });
    return this.repository.list(input);
  }
}


