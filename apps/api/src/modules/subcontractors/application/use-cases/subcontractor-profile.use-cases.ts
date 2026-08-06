import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { isValidFrenchVatNumber, isValidSiren, isValidSiret } from "../../../company-profile";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { InvalidSubcontractorIdentifierFormatError, InvalidSubcontractorProfileStatusTransitionError, SubcontractorProfileNotFoundError } from "../../domain/errors";
import { canTransitionSubcontractorProfileStatus, SubcontractorProfileStatus } from "../../domain/subcontractor-profile-status";
import { SubcontractorPermission } from "../../domain/subcontractor-permission";
import type { SubcontractorProfileRecord } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { SUBCONTRACTOR_PROFILE_REPOSITORY, type Patch, type SubcontractorProfileRepository } from "../ports/subcontractor.repository";
import { SubcontractorAccessService } from "../services/subcontractor-access.service";

export type CreateSubcontractorProfileCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  legalName: string;
  tradeName?: string | undefined;
  siren?: string | undefined;
  siret?: string | undefined;
  vatNumber?: string | undefined;
  legalForm?: string | undefined;
  apeCode?: string | undefined;
  addressLine?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
  legalRepresentativeName?: string | undefined;
  contactEmail?: string | undefined;
  contactPhone?: string | undefined;
  skills?: string | undefined;
  domains?: string | undefined;
  humanResourcesSummary?: string | undefined;
  materialResourcesSummary?: string | undefined;
  bankAccountHolder?: string | undefined;
  iban?: string | undefined;
  bic?: string | undefined;
  bankDocumentId?: string | undefined;
  confirmDuplicate?: boolean | undefined;
}>;

export type UpdateSubcontractorProfileCommand = Readonly<{
  organizationId: string;
  subcontractorProfileId: string;
  actorId: string;
  actorRole: string;
  patch: Patch<Omit<CreateSubcontractorProfileCommand, "organizationId" | "actorId" | "actorRole" | "confirmDuplicate">>;
}>;

function assertValidIdentifiers(input: { siren?: string | undefined; siret?: string | undefined; vatNumber?: string | undefined }): void {
  if (input.siren !== undefined && !isValidSiren(input.siren)) {
    throw new InvalidSubcontractorIdentifierFormatError("siren");
  }
  if (input.siret !== undefined && !isValidSiret(input.siret)) {
    throw new InvalidSubcontractorIdentifierFormatError("siret");
  }
  if (input.vatNumber !== undefined && input.vatNumber.toUpperCase().startsWith("FR") && !isValidFrenchVatNumber(input.vatNumber)) {
    throw new InvalidSubcontractorIdentifierFormatError("vatNumber");
  }
}

@Injectable()
export class ListSubcontractorProfilesUseCase {
  constructor(
    @Inject(SUBCONTRACTOR_PROFILE_REPOSITORY) private readonly repository: SubcontractorProfileRepository,
    private readonly accessService: SubcontractorAccessService,
  ) {}

  async execute(input: { organizationId: string; actorRole: string; status?: string | undefined; search?: string | undefined }): Promise<SubcontractorProfileRecord[]> {
    this.accessService.assertPermission({ actorRole: input.actorRole, permission: SubcontractorPermission.Read });
    return this.repository.list(input);
  }
}

@Injectable()
export class GetSubcontractorProfileUseCase {
  constructor(
    @Inject(SUBCONTRACTOR_PROFILE_REPOSITORY) private readonly repository: SubcontractorProfileRepository,
    private readonly accessService: SubcontractorAccessService,
  ) {}

  async execute(input: { organizationId: string; subcontractorProfileId: string; actorRole: string }): Promise<SubcontractorProfileRecord> {
    this.accessService.assertPermission({ actorRole: input.actorRole, permission: SubcontractorPermission.Read });
    const profile = await this.repository.findById({ organizationId: input.organizationId, id: input.subcontractorProfileId });
    if (!profile) {
      throw new SubcontractorProfileNotFoundError();
    }
    return profile;
  }
}

@Injectable()
export class CreateSubcontractorProfileUseCase {
  constructor(
    @Inject(SUBCONTRACTOR_PROFILE_REPOSITORY) private readonly repository: SubcontractorProfileRepository,
    private readonly accessService: SubcontractorAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CreateSubcontractorProfileCommand): Promise<SubcontractorProfileRecord> {
    this.accessService.assertPermission({ actorRole: command.actorRole, permission: SubcontractorPermission.Manage });
    assertValidIdentifiers(command);

    if (command.siret && !command.confirmDuplicate) {
      const duplicate = await this.repository.findDuplicateSiretInOrganization({ organizationId: command.organizationId, siret: command.siret });
      if (duplicate) {
        throw new InvalidSubcontractorIdentifierFormatError("siret (doublon — passez confirmDuplicate=true si volontaire)");
      }
    }

    const created = await this.repository.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      legalName: command.legalName,
      tradeName: command.tradeName ?? null,
      siren: command.siren ?? null,
      siret: command.siret ?? null,
      vatNumber: command.vatNumber ?? null,
      legalForm: command.legalForm ?? null,
      apeCode: command.apeCode ?? null,
      addressLine: command.addressLine ?? null,
      postalCode: command.postalCode ?? null,
      city: command.city ?? null,
      country: command.country ?? null,
      legalRepresentativeName: command.legalRepresentativeName ?? null,
      contactEmail: command.contactEmail ?? null,
      contactPhone: command.contactPhone ?? null,
      skills: command.skills ?? null,
      domains: command.domains ?? null,
      humanResourcesSummary: command.humanResourcesSummary ?? null,
      materialResourcesSummary: command.materialResourcesSummary ?? null,
      bankAccountHolder: command.bankAccountHolder ?? null,
      iban: command.iban ?? null,
      bic: command.bic ?? null,
      bankDocumentId: command.bankDocumentId ?? null,
      status: SubcontractorProfileStatus.ToVerify,
      createdBy: command.actorId,
      updatedBy: null,
      archivedAt: null,
    });
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "subcontractor.profile_created",
      resourceType: "subcontractor_profile",
      resourceId: created.id,
      metadata: { legalName: created.legalName },
    });
    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "SubcontractorProfileCreated",
          aggregateType: "SubcontractorProfile",
          aggregateId: created.id,
          payload: { subcontractorProfileId: created.id, legalName: created.legalName },
          occurredAt: this.clock.now(),
        },
      ],
    });
    return created;
  }
}

@Injectable()
export class UpdateSubcontractorProfileUseCase {
  constructor(
    @Inject(SUBCONTRACTOR_PROFILE_REPOSITORY) private readonly repository: SubcontractorProfileRepository,
    private readonly accessService: SubcontractorAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: UpdateSubcontractorProfileCommand): Promise<SubcontractorProfileRecord> {
    this.accessService.assertPermission({ actorRole: command.actorRole, permission: SubcontractorPermission.Manage });
    assertValidIdentifiers(command.patch);

    const updated = await this.repository.update({ organizationId: command.organizationId, id: command.subcontractorProfileId }, { ...command.patch, updatedBy: command.actorId });
    if (!updated) {
      throw new SubcontractorProfileNotFoundError();
    }
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "subcontractor.profile_updated",
      resourceType: "subcontractor_profile",
      resourceId: updated.id,
    });
    return updated;
  }
}

/** Mission §6 : archivage plutôt que suppression physique — même discipline que le compte bancaire
 *  de l'entreprise candidate. */
@Injectable()
export class ArchiveSubcontractorProfileUseCase {
  constructor(
    @Inject(SUBCONTRACTOR_PROFILE_REPOSITORY) private readonly repository: SubcontractorProfileRepository,
    private readonly accessService: SubcontractorAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: { organizationId: string; subcontractorProfileId: string; actorId: string; actorRole: string }): Promise<SubcontractorProfileRecord> {
    this.accessService.assertPermission({ actorRole: input.actorRole, permission: SubcontractorPermission.Archive });
    const existing = await this.repository.findById({ organizationId: input.organizationId, id: input.subcontractorProfileId });
    if (!existing) {
      throw new SubcontractorProfileNotFoundError();
    }
    if (!canTransitionSubcontractorProfileStatus(existing.status as SubcontractorProfileStatus, SubcontractorProfileStatus.Archived)) {
      throw new InvalidSubcontractorProfileStatusTransitionError({ from: existing.status, to: SubcontractorProfileStatus.Archived });
    }
    const updated = await this.repository.update(
      { organizationId: input.organizationId, id: input.subcontractorProfileId },
      { status: SubcontractorProfileStatus.Archived, archivedAt: this.clock.now(), updatedBy: input.actorId },
    );
    if (!updated) {
      throw new SubcontractorProfileNotFoundError();
    }
    await this.auditLogWriter.record({
      organizationId: input.organizationId,
      actorType: "USER",
      actorId: input.actorId,
      action: "subcontractor.profile_archived",
      resourceType: "subcontractor_profile",
      resourceId: updated.id,
    });
    await this.outboxWriter.write({
      organizationId: input.organizationId,
      events: [
        {
          eventType: "SubcontractorProfileArchived",
          aggregateType: "SubcontractorProfile",
          aggregateId: updated.id,
          payload: { subcontractorProfileId: updated.id },
          occurredAt: this.clock.now(),
        },
      ],
    });
    return updated;
  }
}

@Injectable()
export class RestoreSubcontractorProfileUseCase {
  constructor(
    @Inject(SUBCONTRACTOR_PROFILE_REPOSITORY) private readonly repository: SubcontractorProfileRepository,
    private readonly accessService: SubcontractorAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(input: { organizationId: string; subcontractorProfileId: string; actorId: string; actorRole: string }): Promise<SubcontractorProfileRecord> {
    this.accessService.assertPermission({ actorRole: input.actorRole, permission: SubcontractorPermission.Archive });
    const existing = await this.repository.findById({ organizationId: input.organizationId, id: input.subcontractorProfileId });
    if (!existing) {
      throw new SubcontractorProfileNotFoundError();
    }
    if (!canTransitionSubcontractorProfileStatus(existing.status as SubcontractorProfileStatus, SubcontractorProfileStatus.ToVerify)) {
      throw new InvalidSubcontractorProfileStatusTransitionError({ from: existing.status, to: SubcontractorProfileStatus.ToVerify });
    }
    const updated = await this.repository.update(
      { organizationId: input.organizationId, id: input.subcontractorProfileId },
      { status: SubcontractorProfileStatus.ToVerify, archivedAt: null, updatedBy: input.actorId },
    );
    if (!updated) {
      throw new SubcontractorProfileNotFoundError();
    }
    await this.auditLogWriter.record({
      organizationId: input.organizationId,
      actorType: "USER",
      actorId: input.actorId,
      action: "subcontractor.profile_restored",
      resourceType: "subcontractor_profile",
      resourceId: updated.id,
    });
    return updated;
  }
}
