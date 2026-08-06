import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { CompanyMaterialResourceNotFoundError } from "../../domain/errors";
import type { CompanyMaterialResourceRecord } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
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

@Injectable()
export class CreateCompanyMaterialResourceUseCase {
  constructor(
    @Inject(COMPANY_MATERIAL_RESOURCE_REPOSITORY) private readonly repository: CompanyMaterialResourceRepository,
    private readonly accessService: CompanyProfileAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: CreateCompanyMaterialResourceCommand): Promise<CompanyMaterialResourceRecord> {
    await this.accessService.assertClientAccess({ ...command, permission: ClientPermission.ManageCompanyProfile });
    const created = await this.repository.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      clientAccountId: command.clientAccountId,
      category: command.category,
      name: command.name,
      description: command.description ?? null,
      quantity: command.quantity ?? 1,
      characteristics: command.characteristics ?? null,
      location: command.location ?? null,
      availabilityStatus: command.availabilityStatus ?? "AVAILABLE",
      ownershipType: command.ownershipType ?? null,
      documentId: command.documentId ?? null,
      status: "ACTIVE",
      createdBy: command.actorId,
    });
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "company_profile.material_resource_added",
      resourceType: "client_account",
      resourceId: command.clientAccountId,
      metadata: { materialResourceId: created.id },
    });
    return created;
  }
}

@Injectable()
export class UpdateCompanyMaterialResourceUseCase {
  constructor(
    @Inject(COMPANY_MATERIAL_RESOURCE_REPOSITORY) private readonly repository: CompanyMaterialResourceRepository,
    private readonly accessService: CompanyProfileAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: UpdateCompanyMaterialResourceCommand): Promise<CompanyMaterialResourceRecord> {
    await this.accessService.assertClientAccess({ ...command, permission: ClientPermission.ManageCompanyProfile });
    const updated = await this.repository.update({ organizationId: command.organizationId, clientAccountId: command.clientAccountId, id: command.materialResourceId }, command.patch);
    if (!updated) {
      throw new CompanyMaterialResourceNotFoundError();
    }
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "company_profile.material_resource_updated",
      resourceType: "client_account",
      resourceId: command.clientAccountId,
      metadata: { materialResourceId: updated.id },
    });
    return updated;
  }
}
