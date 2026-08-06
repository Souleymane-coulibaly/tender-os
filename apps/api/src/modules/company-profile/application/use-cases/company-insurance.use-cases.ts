import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { computeTemporalValidityStatus, TemporalValidityStatus } from "../../domain/enums";
import { CompanyInsuranceNotFoundError } from "../../domain/errors";
import type { CompanyInsuranceRecord } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { COMPANY_INSURANCE_REPOSITORY, type CompanyInsuranceRepository, type Patch } from "../ports/company-satellite.repository";
import { CompanyProfileAccessService } from "../services/company-profile-access.service";

/** Mission §11 : événement émis avec parcimonie, uniquement quand l'échéance entre effectivement
 *  dans la fenêtre "bientôt expirée"/"expirée" au moment de l'écriture — jamais un job planifié
 *  (hors périmètre ce sprint), ni un événement à chaque champ modifié. */
async function emitExpiringSoonIfNeeded(
  outboxWriter: OutboxWriter,
  clock: Clock,
  input: { organizationId: string; clientAccountId: string; insurance: CompanyInsuranceRecord },
): Promise<void> {
  const now = clock.now();
  const temporalStatus = computeTemporalValidityStatus(input.insurance.expiresAt, now);
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
        payload: { clientAccountId: input.clientAccountId, category: "INSURANCE", insuranceId: input.insurance.id, expiresAt: input.insurance.expiresAt?.toISOString(), temporalStatus },
        occurredAt: now,
      },
    ],
  });
}

export type CreateCompanyInsuranceCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  actorId: string;
  actorRole: string;
  type: string;
  otherTypeLabel?: string | undefined;
  insurer?: string | undefined;
  policyNumber?: string | undefined;
  startDate?: Date | undefined;
  expiresAt?: Date | undefined;
  coverageScope?: string | undefined;
  coverageAmount?: string | undefined;
  coverageCurrency?: string | undefined;
  documentId?: string | undefined;
}>;

export type UpdateCompanyInsuranceCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  insuranceId: string;
  actorId: string;
  actorRole: string;
  patch: Patch<Omit<CreateCompanyInsuranceCommand, "organizationId" | "clientAccountId" | "actorId" | "actorRole">> & { status?: string | undefined };
}>;

@Injectable()
export class ListCompanyInsurancesUseCase {
  constructor(
    @Inject(COMPANY_INSURANCE_REPOSITORY) private readonly repository: CompanyInsuranceRepository,
    private readonly accessService: CompanyProfileAccessService,
  ) {}

  async execute(input: { organizationId: string; clientAccountId: string; actorId: string; actorRole: string }): Promise<CompanyInsuranceRecord[]> {
    await this.accessService.assertClientAccess({ ...input, permission: ClientPermission.ReadCompanyProfile });
    return this.repository.list(input);
  }
}

@Injectable()
export class CreateCompanyInsuranceUseCase {
  constructor(
    @Inject(COMPANY_INSURANCE_REPOSITORY) private readonly repository: CompanyInsuranceRepository,
    private readonly accessService: CompanyProfileAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CreateCompanyInsuranceCommand): Promise<CompanyInsuranceRecord> {
    await this.accessService.assertClientAccess({ ...command, permission: ClientPermission.ManageCompanyProfile });
    const created = await this.repository.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      clientAccountId: command.clientAccountId,
      type: command.type,
      otherTypeLabel: command.otherTypeLabel ?? null,
      insurer: command.insurer ?? null,
      policyNumber: command.policyNumber ?? null,
      startDate: command.startDate ?? null,
      expiresAt: command.expiresAt ?? null,
      coverageScope: command.coverageScope ?? null,
      coverageAmount: command.coverageAmount ?? null,
      coverageCurrency: command.coverageCurrency ?? null,
      documentId: command.documentId ?? null,
      lastVerifiedAt: null,
      status: "ACTIVE",
      createdBy: command.actorId,
    });
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "company_profile.insurance_added",
      resourceType: "client_account",
      resourceId: command.clientAccountId,
      metadata: { insuranceId: created.id, type: created.type },
    });
    await emitExpiringSoonIfNeeded(this.outboxWriter, this.clock, { organizationId: command.organizationId, clientAccountId: command.clientAccountId, insurance: created });
    return created;
  }
}

@Injectable()
export class UpdateCompanyInsuranceUseCase {
  constructor(
    @Inject(COMPANY_INSURANCE_REPOSITORY) private readonly repository: CompanyInsuranceRepository,
    private readonly accessService: CompanyProfileAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateCompanyInsuranceCommand): Promise<CompanyInsuranceRecord> {
    await this.accessService.assertClientAccess({ ...command, permission: ClientPermission.ManageCompanyProfile });
    const updated = await this.repository.update({ organizationId: command.organizationId, clientAccountId: command.clientAccountId, id: command.insuranceId }, command.patch);
    if (!updated) {
      throw new CompanyInsuranceNotFoundError();
    }
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "company_profile.insurance_updated",
      resourceType: "client_account",
      resourceId: command.clientAccountId,
      metadata: { insuranceId: updated.id },
    });
    await emitExpiringSoonIfNeeded(this.outboxWriter, this.clock, { organizationId: command.organizationId, clientAccountId: command.clientAccountId, insurance: updated });
    return updated;
  }
}
