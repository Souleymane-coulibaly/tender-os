import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { CompanyLegalIdentityRecord } from "../application/dtos";
import type { ClientScope, CompanyLegalIdentityRepository } from "../application/ports/company-satellite.repository";

function toRecord(row: {
  id: string;
  organizationId: string;
  clientAccountId: string;
  legalName: string | null;
  tradeName: string | null;
  siren: string | null;
  siretPrincipal: string | null;
  vatNumber: string | null;
  legalForm: string | null;
  shareCapitalAmount: { toString(): string } | null;
  shareCapitalCurrency: string | null;
  apeCode: string | null;
  incorporatedAt: Date | null;
  rcsNumber: string | null;
  rcsCity: string | null;
  registrationCountry: string | null;
  addressLine: string | null;
  addressComplement: string | null;
  postalCode: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  phone: string | null;
  generalEmail: string | null;
  website: string | null;
  status: string;
  lastValidatedAt: Date | null;
  lastValidatedByUserId: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CompanyLegalIdentityRecord {
  return {
    ...row,
    shareCapitalAmount: row.shareCapitalAmount?.toString() ?? null,
  };
}

@Injectable()
export class PrismaCompanyLegalIdentityRepository implements CompanyLegalIdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByClientAccount(scope: ClientScope): Promise<CompanyLegalIdentityRecord | null> {
    const row = await this.prisma.companyLegalIdentity.findFirst({
      where: { organizationId: scope.organizationId, clientAccountId: scope.clientAccountId },
    });
    return row ? toRecord(row) : null;
  }


}
