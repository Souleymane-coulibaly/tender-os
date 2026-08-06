import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { CompanyRepresentativeNotFoundError } from "../../domain/errors";
import type { CompanyRepresentativeRecord } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { COMPANY_REPRESENTATIVE_REPOSITORY, type CompanyRepresentativeRepository, type Patch } from "../ports/company-satellite.repository";
import { CompanyProfileAccessService } from "../services/company-profile-access.service";

export type CreateCompanyRepresentativeCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  actorId: string;
  actorRole: string;
  firstName: string;
  lastName: string;
  type: string;
  jobTitle?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  signatureScope?: string | undefined;
  signatureLimitations?: string | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
}>;

export type UpdateCompanyRepresentativeCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  representativeId: string;
  actorId: string;
  actorRole: string;
  patch: Patch<Omit<CreateCompanyRepresentativeCommand, "organizationId" | "clientAccountId" | "actorId" | "actorRole">> & { status?: string | undefined };
}>;

@Injectable()
export class ListCompanyRepresentativesUseCase {
  constructor(
    @Inject(COMPANY_REPRESENTATIVE_REPOSITORY) private readonly repository: CompanyRepresentativeRepository,
    private readonly accessService: CompanyProfileAccessService,
  ) {}

  async execute(input: { organizationId: string; clientAccountId: string; actorId: string; actorRole: string }): Promise<CompanyRepresentativeRecord[]> {
    await this.accessService.assertClientAccess({ ...input, permission: ClientPermission.ReadCompanyProfile });
    return this.repository.list(input);
  }
}

@Injectable()
export class CreateCompanyRepresentativeUseCase {
  constructor(
    @Inject(COMPANY_REPRESENTATIVE_REPOSITORY) private readonly repository: CompanyRepresentativeRepository,
    private readonly accessService: CompanyProfileAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: CreateCompanyRepresentativeCommand): Promise<CompanyRepresentativeRecord> {
    await this.accessService.assertClientAccess({ ...command, permission: ClientPermission.ManageCompanyProfile });
    const created = await this.repository.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      clientAccountId: command.clientAccountId,
      firstName: command.firstName,
      lastName: command.lastName,
      type: command.type,
      jobTitle: command.jobTitle ?? null,
      email: command.email ?? null,
      phone: command.phone ?? null,
      signatureScope: command.signatureScope ?? null,
      signatureLimitations: command.signatureLimitations ?? null,
      startDate: command.startDate ?? null,
      endDate: command.endDate ?? null,
      status: "ACTIVE",
      createdBy: command.actorId,
      updatedBy: null,
    });
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "company_profile.representative_added",
      resourceType: "client_account",
      resourceId: command.clientAccountId,
      metadata: { representativeId: created.id, type: created.type },
    });
    return created;
  }
}

@Injectable()
export class UpdateCompanyRepresentativeUseCase {
  constructor(
    @Inject(COMPANY_REPRESENTATIVE_REPOSITORY) private readonly repository: CompanyRepresentativeRepository,
    private readonly accessService: CompanyProfileAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: UpdateCompanyRepresentativeCommand): Promise<CompanyRepresentativeRecord> {
    await this.accessService.assertClientAccess({ ...command, permission: ClientPermission.ManageCompanyProfile });
    const updated = await this.repository.update(
      { organizationId: command.organizationId, clientAccountId: command.clientAccountId, id: command.representativeId },
      { ...command.patch, updatedBy: command.actorId },
    );
    if (!updated) {
      throw new CompanyRepresentativeNotFoundError();
    }
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "company_profile.representative_updated",
      resourceType: "client_account",
      resourceId: command.clientAccountId,
      metadata: { representativeId: updated.id },
    });
    return updated;
  }
}
