import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import type { CompanyCertificationRecord } from "../dtos";
import { COMPANY_CERTIFICATION_REPOSITORY, type CompanyCertificationRepository, type Patch } from "../ports/company-satellite.repository";
import { CompanyProfileAccessService } from "../services/company-profile-access.service";

export type CreateCompanyCertificationCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  actorId: string;
  actorRole: string;
  name: string;
  issuer?: string | undefined;
  number?: string | undefined;
  type?: string | undefined;
  scope?: string | undefined;
  obtainedAt?: Date | undefined;
  expiresAt?: Date | undefined;
  documentId?: string | undefined;
}>;

export type UpdateCompanyCertificationCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  certificationId: string;
  actorId: string;
  actorRole: string;
  patch: Patch<Omit<CreateCompanyCertificationCommand, "organizationId" | "clientAccountId" | "actorId" | "actorRole">> & { status?: string | undefined };
}>;


@Injectable()
export class ListCompanyCertificationsUseCase {
  constructor(
    @Inject(COMPANY_CERTIFICATION_REPOSITORY) private readonly repository: CompanyCertificationRepository,
    private readonly accessService: CompanyProfileAccessService,
  ) {}

  async execute(input: { organizationId: string; clientAccountId: string; actorId: string; actorRole: string }): Promise<CompanyCertificationRecord[]> {
    await this.accessService.assertClientAccess({ ...input, permission: ClientPermission.ReadCompanyProfile });
    return this.repository.list(input);
  }
}


