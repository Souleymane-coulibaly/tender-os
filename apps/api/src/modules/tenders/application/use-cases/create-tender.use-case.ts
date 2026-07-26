import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { TenderPermission } from "../../domain/tender-permission";
import { Tender } from "../../domain/tender.aggregate";
import { TenderId } from "../../domain/tender-id.value-object";
import { toTenderSummary, type TenderSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type CreateTenderCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  title: string;
  reference?: string | undefined;
  buyerName?: string | undefined;
  description?: string | undefined;
  publicationDate?: string | undefined;
  submissionDeadline?: string | undefined;
  procedureType?: string | undefined;
  marketType?: string | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
  internalOwnerId?: string | undefined;
  tags?: string[] | undefined;
  requestId?: string | undefined;
}>;

export type CreateTenderResult = TenderSummary;

@Injectable()
export class CreateTenderUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateTenderCommand): Promise<CreateTenderResult> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Create);

    const occurredAt = this.clock.now();

    const tender = Tender.create({
      id: TenderId.from(this.idGenerator.generate()),
      organizationId: command.organizationId,
      title: command.title,
      reference: command.reference,
      buyerName: command.buyerName,
      description: command.description,
      publicationDate: command.publicationDate ? new Date(command.publicationDate) : undefined,
      submissionDeadline: command.submissionDeadline ? new Date(command.submissionDeadline) : undefined,
      procedureType: command.procedureType,
      marketType: command.marketType,
      estimatedAmount: command.estimatedAmount,
      currency: command.currency,
      internalOwnerId: command.internalOwnerId,
      tags: command.tags,
      createdBy: command.actorId,
      occurredAt,
    });

    await this.tenderRepository.save(tender);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.created",
      resourceType: "tender",
      resourceId: tender.id.value,
      requestId: command.requestId,
    });

    return toTenderSummary(tender);
  }
}
