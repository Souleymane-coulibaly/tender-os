import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import type { CompanyInsuranceRecord } from "../dtos";
import { COMPANY_INSURANCE_REPOSITORY, type CompanyInsuranceRepository, type Patch } from "../ports/company-satellite.repository";
import { CompanyProfileAccessService } from "../services/company-profile-access.service";


export type CreateCompanyInsuranceCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  actorId: string;
  actorRole: string;
  type: string;
  otherTypeLabel?: string | undefined;
  insurer?: string | undefined;
  policyNumber?: string | undefined;
  startDate?: Date | undefined;
  expiresAt?: Date | undefined;
  coverageScope?: string | undefined;
  coverageAmount?: string | undefined;
  coverageCurrency?: string | undefined;
  documentId?: string | undefined;
}>;

export type UpdateCompanyInsuranceCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  insuranceId: string;
  actorId: string;
  actorRole: string;
  patch: Patch<Omit<CreateCompanyInsuranceCommand, "organizationId" | "clientAccountId" | "actorId" | "actorRole">> & { status?: string | undefined };
}>;

@Injectable()
export class ListCompanyInsurancesUseCase {
  constructor(
    @Inject(COMPANY_INSURANCE_REPOSITORY) private readonly repository: CompanyInsuranceRepository,
    private readonly accessService: CompanyProfileAccessService,
  ) {}

  async execute(input: { organizationId: string; clientAccountId: string; actorId: string; actorRole: string }): Promise<CompanyInsuranceRecord[]> {
    await this.accessService.assertClientAccess({ ...input, permission: ClientPermission.ReadCompanyProfile });
    return this.repository.list(input);
  }
}


