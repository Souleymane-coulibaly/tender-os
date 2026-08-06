import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { GetDocumentUseCase } from "../../../documents";
import {
  DuplicateSubcontractorProfileDocumentError,
  SubcontractorCertificationNotFoundError,
  SubcontractorInsuranceNotFoundError,
  SubcontractorProfileNotFoundError,
  SubcontractorReferenceNotFoundError,
} from "../../domain/errors";
import { SubcontractorPermission } from "../../domain/subcontractor-permission";
import type { SubcontractorCertificationRecord, SubcontractorInsuranceRecord, SubcontractorProfileDocumentRecord, SubcontractorReferenceRecord } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import {
  SUBCONTRACTOR_CERTIFICATION_REPOSITORY,
  SUBCONTRACTOR_INSURANCE_REPOSITORY,
  SUBCONTRACTOR_PROFILE_DOCUMENT_REPOSITORY,
  SUBCONTRACTOR_PROFILE_REPOSITORY,
  SUBCONTRACTOR_REFERENCE_REPOSITORY,
  type SubcontractorCertificationRepository,
  type SubcontractorInsuranceRepository,
  type SubcontractorProfileDocumentRepository,
  type SubcontractorProfileRepository,
  type SubcontractorReferenceRepository,
} from "../ports/subcontractor.repository";
import { SubcontractorAccessService } from "../services/subcontractor-access.service";
import { verifyAttachableDocument } from "../services/verify-attachable-document";

type BaseCommand = Readonly<{ organizationId: string; subcontractorProfileId: string; actorId: string; actorRole: string }>;

async function assertProfileExists(repository: SubcontractorProfileRepository, organizationId: string, subcontractorProfileId: string): Promise<void> {
  const profile = await repository.findById({ organizationId, id: subcontractorProfileId });
  if (!profile) {
    throw new SubcontractorProfileNotFoundError();
  }
}

@Injectable()
export class ListSubcontractorReferencesUseCase {
  constructor(
    @Inject(SUBCONTRACTOR_REFERENCE_REPOSITORY) private readonly repository: SubcontractorReferenceRepository,
    private readonly accessService: SubcontractorAccessService,
  ) {}

  async execute(input: BaseCommand): Promise<SubcontractorReferenceRecord[]> {
    this.accessService.assertPermission({ actorRole: input.actorRole, permission: SubcontractorPermission.Read });
    return this.repository.list(input);
  }
}

@Injectable()
export class CreateSubcontractorReferenceUseCase {
  constructor(
    @Inject(SUBCONTRACTOR_REFERENCE_REPOSITORY) private readonly repository: SubcontractorReferenceRepository,
    @Inject(SUBCONTRACTOR_PROFILE_REPOSITORY) private readonly profileRepository: SubcontractorProfileRepository,
    private readonly accessService: SubcontractorAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: BaseCommand & { projectName: string; clientName?: string | undefined; description?: string | undefined; startDate?: Date | undefined; endDate?: Date | undefined }): Promise<SubcontractorReferenceRecord> {
    this.accessService.assertPermission({ actorRole: command.actorRole, permission: SubcontractorPermission.Manage });
    await assertProfileExists(this.profileRepository, command.organizationId, command.subcontractorProfileId);
    const created = await this.repository.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      subcontractorProfileId: command.subcontractorProfileId,
      projectName: command.projectName,
      clientName: command.clientName ?? null,
      description: command.description ?? null,
      startDate: command.startDate ?? null,
      endDate: command.endDate ?? null,
      status: "ACTIVE",
      createdBy: command.actorId,
    });
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "subcontractor.reference_added",
      resourceType: "subcontractor_profile",
      resourceId: command.subcontractorProfileId,
      metadata: { referenceId: created.id },
    });
    return created;
  }
}

/** Correctif audit Codex P1 — jamais un `delete` Prisma, seulement `status = ARCHIVED` (historique
 *  conservé, mission "conserver l'historique"). */
@Injectable()
export class ArchiveSubcontractorReferenceUseCase {
  constructor(
    @Inject(SUBCONTRACTOR_REFERENCE_REPOSITORY) private readonly repository: SubcontractorReferenceRepository,
    private readonly accessService: SubcontractorAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(input: BaseCommand & { referenceId: string }): Promise<void> {
    this.accessService.assertPermission({ actorRole: input.actorRole, permission: SubcontractorPermission.Manage });
    const archived = await this.repository.archive({ organizationId: input.organizationId, id: input.referenceId });
    if (!archived) {
      throw new SubcontractorReferenceNotFoundError();
    }
    await this.auditLogWriter.record({
      organizationId: input.organizationId,
      actorType: "USER",
      actorId: input.actorId,
      action: "subcontractor.reference_archived",
      resourceType: "subcontractor_profile",
      resourceId: input.subcontractorProfileId,
      metadata: { referenceId: input.referenceId },
    });
  }
}

@Injectable()
export class ListSubcontractorCertificationsUseCase {
  constructor(
    @Inject(SUBCONTRACTOR_CERTIFICATION_REPOSITORY) private readonly repository: SubcontractorCertificationRepository,
    private readonly accessService: SubcontractorAccessService,
  ) {}

  async execute(input: BaseCommand): Promise<SubcontractorCertificationRecord[]> {
    this.accessService.assertPermission({ actorRole: input.actorRole, permission: SubcontractorPermission.Read });
    return this.repository.list(input);
  }
}

@Injectable()
export class CreateSubcontractorCertificationUseCase {
  constructor(
    @Inject(SUBCONTRACTOR_CERTIFICATION_REPOSITORY) private readonly repository: SubcontractorCertificationRepository,
    @Inject(SUBCONTRACTOR_PROFILE_REPOSITORY) private readonly profileRepository: SubcontractorProfileRepository,
    private readonly accessService: SubcontractorAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(
    command: BaseCommand & { name: string; issuer?: string | undefined; number?: string | undefined; obtainedAt?: Date | undefined; expiresAt?: Date | undefined; documentId?: string | undefined },
  ): Promise<SubcontractorCertificationRecord> {
    this.accessService.assertPermission({ actorRole: command.actorRole, permission: SubcontractorPermission.Manage });
    await assertProfileExists(this.profileRepository, command.organizationId, command.subcontractorProfileId);
    const created = await this.repository.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      subcontractorProfileId: command.subcontractorProfileId,
      name: command.name,
      issuer: command.issuer ?? null,
      number: command.number ?? null,
      obtainedAt: command.obtainedAt ?? null,
      expiresAt: command.expiresAt ?? null,
      documentId: command.documentId ?? null,
      status: "ACTIVE",
      createdBy: command.actorId,
    });
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "subcontractor.certification_added",
      resourceType: "subcontractor_profile",
      resourceId: command.subcontractorProfileId,
      metadata: { certificationId: created.id },
    });
    return created;
  }
}

@Injectable()
export class ArchiveSubcontractorCertificationUseCase {
  constructor(
    @Inject(SUBCONTRACTOR_CERTIFICATION_REPOSITORY) private readonly repository: SubcontractorCertificationRepository,
    private readonly accessService: SubcontractorAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(input: BaseCommand & { certificationId: string }): Promise<void> {
    this.accessService.assertPermission({ actorRole: input.actorRole, permission: SubcontractorPermission.Manage });
    const archived = await this.repository.archive({ organizationId: input.organizationId, id: input.certificationId });
    if (!archived) {
      throw new SubcontractorCertificationNotFoundError();
    }
    await this.auditLogWriter.record({
      organizationId: input.organizationId,
      actorType: "USER",
      actorId: input.actorId,
      action: "subcontractor.certification_archived",
      resourceType: "subcontractor_profile",
      resourceId: input.subcontractorProfileId,
      metadata: { certificationId: input.certificationId },
    });
  }
}

@Injectable()
export class ListSubcontractorInsurancesUseCase {
  constructor(
    @Inject(SUBCONTRACTOR_INSURANCE_REPOSITORY) private readonly repository: SubcontractorInsuranceRepository,
    private readonly accessService: SubcontractorAccessService,
  ) {}

  async execute(input: BaseCommand): Promise<SubcontractorInsuranceRecord[]> {
    this.accessService.assertPermission({ actorRole: input.actorRole, permission: SubcontractorPermission.Read });
    return this.repository.list(input);
  }
}

@Injectable()
export class CreateSubcontractorInsuranceUseCase {
  constructor(
    @Inject(SUBCONTRACTOR_INSURANCE_REPOSITORY) private readonly repository: SubcontractorInsuranceRepository,
    @Inject(SUBCONTRACTOR_PROFILE_REPOSITORY) private readonly profileRepository: SubcontractorProfileRepository,
    private readonly accessService: SubcontractorAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(
    command: BaseCommand & { type: string; insurer?: string | undefined; policyNumber?: string | undefined; expiresAt?: Date | undefined; documentId?: string | undefined },
  ): Promise<SubcontractorInsuranceRecord> {
    this.accessService.assertPermission({ actorRole: command.actorRole, permission: SubcontractorPermission.Manage });
    await assertProfileExists(this.profileRepository, command.organizationId, command.subcontractorProfileId);
    const created = await this.repository.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      subcontractorProfileId: command.subcontractorProfileId,
      type: command.type,
      insurer: command.insurer ?? null,
      policyNumber: command.policyNumber ?? null,
      expiresAt: command.expiresAt ?? null,
      documentId: command.documentId ?? null,
      status: "ACTIVE",
      createdBy: command.actorId,
    });
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "subcontractor.insurance_added",
      resourceType: "subcontractor_profile",
      resourceId: command.subcontractorProfileId,
      metadata: { insuranceId: created.id },
    });
    return created;
  }
}

@Injectable()
export class ArchiveSubcontractorInsuranceUseCase {
  constructor(
    @Inject(SUBCONTRACTOR_INSURANCE_REPOSITORY) private readonly repository: SubcontractorInsuranceRepository,
    private readonly accessService: SubcontractorAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(input: BaseCommand & { insuranceId: string }): Promise<void> {
    this.accessService.assertPermission({ actorRole: input.actorRole, permission: SubcontractorPermission.Manage });
    const archived = await this.repository.archive({ organizationId: input.organizationId, id: input.insuranceId });
    if (!archived) {
      throw new SubcontractorInsuranceNotFoundError();
    }
    await this.auditLogWriter.record({
      organizationId: input.organizationId,
      actorType: "USER",
      actorId: input.actorId,
      action: "subcontractor.insurance_archived",
      resourceType: "subcontractor_profile",
      resourceId: input.subcontractorProfileId,
      metadata: { insuranceId: input.insuranceId },
    });
  }
}

@Injectable()
export class ListSubcontractorProfileDocumentsUseCase {
  constructor(
    @Inject(SUBCONTRACTOR_PROFILE_DOCUMENT_REPOSITORY) private readonly repository: SubcontractorProfileDocumentRepository,
    private readonly accessService: SubcontractorAccessService,
  ) {}

  async execute(input: BaseCommand): Promise<SubcontractorProfileDocumentRecord[]> {
    this.accessService.assertPermission({ actorRole: input.actorRole, permission: SubcontractorPermission.Read });
    return this.repository.list(input);
  }
}

@Injectable()
export class AttachSubcontractorProfileDocumentUseCase {
  constructor(
    @Inject(SUBCONTRACTOR_PROFILE_DOCUMENT_REPOSITORY) private readonly repository: SubcontractorProfileDocumentRepository,
    @Inject(SUBCONTRACTOR_PROFILE_REPOSITORY) private readonly profileRepository: SubcontractorProfileRepository,
    private readonly accessService: SubcontractorAccessService,
    private readonly getDocumentUseCase: GetDocumentUseCase,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: BaseCommand & { documentId: string; category: string }): Promise<SubcontractorProfileDocumentRecord> {
    this.accessService.assertPermission({ actorRole: command.actorRole, permission: SubcontractorPermission.Manage });
    await assertProfileExists(this.profileRepository, command.organizationId, command.subcontractorProfileId);
    const { documentId } = await verifyAttachableDocument(this.getDocumentUseCase, command);

    const existing = await this.repository.list({ organizationId: command.organizationId, subcontractorProfileId: command.subcontractorProfileId });
    if (existing.some((association) => association.documentId === documentId)) {
      throw new DuplicateSubcontractorProfileDocumentError();
    }

    const created = await this.repository.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      subcontractorProfileId: command.subcontractorProfileId,
      documentId,
      category: command.category,
      createdByUserId: command.actorId,
    });
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "subcontractor.document_attached",
      resourceType: "subcontractor_profile",
      resourceId: command.subcontractorProfileId,
      metadata: { documentId, category: command.category },
    });
    return created;
  }
}
