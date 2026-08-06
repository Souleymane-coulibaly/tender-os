import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { computeTemporalValidityStatus, TemporalValidityStatus } from "../../domain/enums";
import { CompanyCertificationNotFoundError } from "../../domain/errors";
import type { CompanyCertificationRecord } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
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

/** Mission §11 : événement émis avec parcimonie, uniquement quand l'échéance entre effectivement
 *  dans la fenêtre "bientôt expirée"/"expirée" au moment de l'écriture. */
async function emitExpiringSoonIfNeeded(
  outboxWriter: OutboxWriter,
  clock: Clock,
  input: { organizationId: string; clientAccountId: string; certification: CompanyCertificationRecord },
): Promise<void> {
  const now = clock.now();
  const temporalStatus = computeTemporalValidityStatus(input.certification.expiresAt, now);
  if (temporalStatus !== TemporalValidityStatus.ExpiringSoon && temporalStatus !== TemporalValidityStatus.Expired) {
    return;
  }
  await outboxWriter.write({
    organizationId: input.organizationId,
    events: [
      {
        eventType: "CandidateDocumentExpiringSoon",
        aggregateType: "ClientAccount",
        aggregateId: input.clientAccountId,
        payload: {
          clientAccountId: input.clientAccountId,
          category: "CERTIFICATION",
          certificationId: input.certification.id,
          expiresAt: input.certification.expiresAt?.toISOString(),
          temporalStatus,
        },
        occurredAt: now,
      },
    ],
  });
}

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

@Injectable()
export class CreateCompanyCertificationUseCase {
  constructor(
    @Inject(COMPANY_CERTIFICATION_REPOSITORY) private readonly repository: CompanyCertificationRepository,
    private readonly accessService: CompanyProfileAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CreateCompanyCertificationCommand): Promise<CompanyCertificationRecord> {
    await this.accessService.assertClientAccess({ ...command, permission: ClientPermission.ManageCompanyProfile });
    const created = await this.repository.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      clientAccountId: command.clientAccountId,
      name: command.name,
      issuer: command.issuer ?? null,
      number: command.number ?? null,
      type: command.type ?? null,
      scope: command.scope ?? null,
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
      action: "company_profile.certification_added",
      resourceType: "client_account",
      resourceId: command.clientAccountId,
      metadata: { certificationId: created.id, name: created.name },
    });
    await emitExpiringSoonIfNeeded(this.outboxWriter, this.clock, { organizationId: command.organizationId, clientAccountId: command.clientAccountId, certification: created });
    return created;
  }
}

@Injectable()
export class UpdateCompanyCertificationUseCase {
  constructor(
    @Inject(COMPANY_CERTIFICATION_REPOSITORY) private readonly repository: CompanyCertificationRepository,
    private readonly accessService: CompanyProfileAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateCompanyCertificationCommand): Promise<CompanyCertificationRecord> {
    await this.accessService.assertClientAccess({ ...command, permission: ClientPermission.ManageCompanyProfile });
    const updated = await this.repository.update({ organizationId: command.organizationId, clientAccountId: command.clientAccountId, id: command.certificationId }, command.patch);
    if (!updated) {
      throw new CompanyCertificationNotFoundError();
    }
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "company_profile.certification_updated",
      resourceType: "client_account",
      resourceId: command.clientAccountId,
      metadata: { certificationId: updated.id },
    });
    await emitExpiringSoonIfNeeded(this.outboxWriter, this.clock, { organizationId: command.organizationId, clientAccountId: command.clientAccountId, certification: updated });
    return updated;
  }
}
