import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { GetDocumentUseCase } from "../../../documents";
import { CompanyReferenceNotFoundError } from "../../domain/errors";
import type { CompanyReferenceDocumentRecord, CompanyReferenceRecord } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import {
  COMPANY_REFERENCE_DOCUMENT_REPOSITORY,
  COMPANY_REFERENCE_REPOSITORY,
  type CompanyReferenceDocumentRepository,
  type CompanyReferenceRepository,
  type Patch,
} from "../ports/company-satellite.repository";
import { CompanyProfileAccessService } from "../services/company-profile-access.service";
import { verifyAttachableDocument } from "../services/verify-attachable-document";

export type CreateCompanyReferenceCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  actorId: string;
  actorRole: string;
  projectName: string;
  referenceClientName?: string | undefined;
  sector?: string | undefined;
  description?: string | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
  amountValue?: string | undefined;
  amountCurrency?: string | undefined;
  companyRole?: string | undefined;
  lotsOrServices?: string | undefined;
  skillsOrTechnologies?: string | undefined;
  results?: string | undefined;
  contactName?: string | undefined;
  contactEmail?: string | undefined;
  contactPhone?: string | undefined;
  confidentiality?: string | undefined;
}>;

export type UpdateCompanyReferenceCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  referenceId: string;
  actorId: string;
  actorRole: string;
  patch: Patch<Omit<CreateCompanyReferenceCommand, "organizationId" | "clientAccountId" | "actorId" | "actorRole">> & { status?: string | undefined };
}>;

@Injectable()
export class ListCompanyReferencesUseCase {
  constructor(
    @Inject(COMPANY_REFERENCE_REPOSITORY) private readonly repository: CompanyReferenceRepository,
    private readonly accessService: CompanyProfileAccessService,
  ) {}

  async execute(input: { organizationId: string; clientAccountId: string; actorId: string; actorRole: string }): Promise<CompanyReferenceRecord[]> {
    await this.accessService.assertClientAccess({ ...input, permission: ClientPermission.ReadCompanyProfile });
    return this.repository.list(input);
  }
}

@Injectable()
export class CreateCompanyReferenceUseCase {
  constructor(
    @Inject(COMPANY_REFERENCE_REPOSITORY) private readonly repository: CompanyReferenceRepository,
    private readonly accessService: CompanyProfileAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: CreateCompanyReferenceCommand): Promise<CompanyReferenceRecord> {
    await this.accessService.assertClientAccess({ ...command, permission: ClientPermission.ManageCompanyProfile });
    const created = await this.repository.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      clientAccountId: command.clientAccountId,
      projectName: command.projectName,
      referenceClientName: command.referenceClientName ?? null,
      sector: command.sector ?? null,
      description: command.description ?? null,
      startDate: command.startDate ?? null,
      endDate: command.endDate ?? null,
      amountValue: command.amountValue ?? null,
      amountCurrency: command.amountCurrency ?? null,
      companyRole: command.companyRole ?? null,
      lotsOrServices: command.lotsOrServices ?? null,
      skillsOrTechnologies: command.skillsOrTechnologies ?? null,
      results: command.results ?? null,
      contactName: command.contactName ?? null,
      contactEmail: command.contactEmail ?? null,
      contactPhone: command.contactPhone ?? null,
      confidentiality: command.confidentiality ?? "STANDARD",
      status: "DRAFT",
      createdBy: command.actorId,
    });
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "company_profile.reference_added",
      resourceType: "client_account",
      resourceId: command.clientAccountId,
      metadata: { referenceId: created.id, confidentiality: created.confidentiality },
    });
    return created;
  }
}

@Injectable()
export class UpdateCompanyReferenceUseCase {
  constructor(
    @Inject(COMPANY_REFERENCE_REPOSITORY) private readonly repository: CompanyReferenceRepository,
    private readonly accessService: CompanyProfileAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: UpdateCompanyReferenceCommand): Promise<CompanyReferenceRecord> {
    await this.accessService.assertClientAccess({ ...command, permission: ClientPermission.ManageCompanyProfile });
    const updated = await this.repository.update({ organizationId: command.organizationId, clientAccountId: command.clientAccountId, id: command.referenceId }, command.patch);
    if (!updated) {
      throw new CompanyReferenceNotFoundError();
    }
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "company_profile.reference_updated",
      resourceType: "client_account",
      resourceId: command.clientAccountId,
      metadata: { referenceId: updated.id },
    });
    return updated;
  }
}

/** Mission §4.7/§5 : plusieurs documents possibles par référence, join dédié
 *  (`CompanyReferenceDocument`), jamais la relation polymorphe générale. */
@Injectable()
export class AttachDocumentToCompanyReferenceUseCase {
  constructor(
    @Inject(COMPANY_REFERENCE_REPOSITORY) private readonly referenceRepository: CompanyReferenceRepository,
    @Inject(COMPANY_REFERENCE_DOCUMENT_REPOSITORY) private readonly documentRepository: CompanyReferenceDocumentRepository,
    private readonly accessService: CompanyProfileAccessService,
    private readonly getDocumentUseCase: GetDocumentUseCase,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(input: {
    organizationId: string;
    clientAccountId: string;
    referenceId: string;
    documentId: string;
    actorId: string;
    actorRole: string;
  }): Promise<CompanyReferenceDocumentRecord> {
    await this.accessService.assertClientAccess({ ...input, permission: ClientPermission.ManageCompanyProfile });
    const reference = await this.referenceRepository.findById({ organizationId: input.organizationId, clientAccountId: input.clientAccountId, id: input.referenceId });
    if (!reference) {
      throw new CompanyReferenceNotFoundError();
    }
    const { documentId } = await verifyAttachableDocument(this.getDocumentUseCase, input);

    const association = await this.documentRepository.create({
      id: randomUUID(),
      organizationId: input.organizationId,
      companyReferenceId: input.referenceId,
      documentId,
      createdByUserId: input.actorId,
    });
    await this.auditLogWriter.record({
      organizationId: input.organizationId,
      actorType: "USER",
      actorId: input.actorId,
      action: "company_profile.reference_document_attached",
      resourceType: "client_account",
      resourceId: input.clientAccountId,
      metadata: { referenceId: input.referenceId, documentId },
    });
    return association;
  }
}

@Injectable()
export class ListCompanyReferenceDocumentsUseCase {
  constructor(
    @Inject(COMPANY_REFERENCE_DOCUMENT_REPOSITORY) private readonly documentRepository: CompanyReferenceDocumentRepository,
    private readonly accessService: CompanyProfileAccessService,
  ) {}

  async execute(input: { organizationId: string; clientAccountId: string; referenceId: string; actorId: string; actorRole: string }): Promise<CompanyReferenceDocumentRecord[]> {
    await this.accessService.assertClientAccess({ ...input, permission: ClientPermission.ReadCompanyProfile });
    return this.documentRepository.list({ organizationId: input.organizationId, companyReferenceId: input.referenceId });
  }
}
