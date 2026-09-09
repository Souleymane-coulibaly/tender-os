import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import type { CompanyLegalIdentityRecord } from "../dtos";
import { COMPANY_LEGAL_IDENTITY_REPOSITORY, type CompanyLegalIdentityRepository } from "../ports/company-satellite.repository";
import { CompanyProfileAccessService } from "../services/company-profile-access.service";

export type UpsertCompanyLegalIdentityCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  actorId: string;
  actorRole: string;
  legalName?: string | undefined;
  tradeName?: string | undefined;
  siren?: string | undefined;
  siretPrincipal?: string | undefined;
  vatNumber?: string | undefined;
  legalForm?: string | undefined;
  shareCapitalAmount?: string | undefined;
  shareCapitalCurrency?: string | undefined;
  apeCode?: string | undefined;
  incorporatedAt?: Date | undefined;
  rcsNumber?: string | undefined;
  rcsCity?: string | undefined;
  registrationCountry?: string | undefined;
  addressLine?: string | undefined;
  addressComplement?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  region?: string | undefined;
  country?: string | undefined;
  phone?: string | undefined;
  generalEmail?: string | undefined;
  website?: string | undefined;
  confirmDuplicate?: boolean | undefined;
}>;

@Injectable()
export class GetCompanyLegalIdentityUseCase {
  constructor(
    @Inject(COMPANY_LEGAL_IDENTITY_REPOSITORY) private readonly repository: CompanyLegalIdentityRepository,
    private readonly accessService: CompanyProfileAccessService,
  ) {}

  async execute(input: { organizationId: string; clientAccountId: string; actorId: string; actorRole: string }): Promise<CompanyLegalIdentityRecord | null> {
    await this.accessService.assertClientAccess({ ...input, permission: ClientPermission.ReadCompanyProfile });
    return this.repository.findByClientAccount(input);
  }
}


export { randomUUID };
