import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { CompanyHumanResourceNotFoundError } from "../../domain/errors";
import type { CompanyHumanResourceRecord } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
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

@Injectable()
export class CreateCompanyHumanResourceUseCase {
  constructor(
    @Inject(COMPANY_HUMAN_RESOURCE_REPOSITORY) private readonly repository: CompanyHumanResourceRepository,
    private readonly accessService: CompanyProfileAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: CreateCompanyHumanResourceCommand): Promise<CompanyHumanResourceRecord> {
    await this.accessService.assertClientAccess({ ...command, permission: ClientPermission.ManageCompanyProfile });
    const created = await this.repository.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      clientAccountId: command.clientAccountId,
      category: command.category,
      title: command.title,
      headcount: command.headcount ?? 1,
      qualification: command.qualification ?? null,
      averageExperienceYears: command.averageExperienceYears ?? null,
      skills: command.skills ?? null,
      certifications: command.certifications ?? null,
      availabilityNote: command.availabilityNote ?? null,
      location: command.location ?? null,
      status: "ACTIVE",
      createdBy: command.actorId,
    });
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "company_profile.human_resource_added",
      resourceType: "client_account",
      resourceId: command.clientAccountId,
      metadata: { humanResourceId: created.id },
    });
    return created;
  }
}

@Injectable()
export class UpdateCompanyHumanResourceUseCase {
  constructor(
    @Inject(COMPANY_HUMAN_RESOURCE_REPOSITORY) private readonly repository: CompanyHumanResourceRepository,
    private readonly accessService: CompanyProfileAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: UpdateCompanyHumanResourceCommand): Promise<CompanyHumanResourceRecord> {
    await this.accessService.assertClientAccess({ ...command, permission: ClientPermission.ManageCompanyProfile });
    const updated = await this.repository.update({ organizationId: command.organizationId, clientAccountId: command.clientAccountId, id: command.humanResourceId }, command.patch);
    if (!updated) {
      throw new CompanyHumanResourceNotFoundError();
    }
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "company_profile.human_resource_updated",
      resourceType: "client_account",
      resourceId: command.clientAccountId,
      metadata: { humanResourceId: updated.id },
    });
    return updated;
  }
}
