import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { BuyerNotFoundError } from "../../domain/errors";
import { TenderPermission } from "../../domain/tender-permission";
import { parseMarketType } from "../../domain/market-type";
import { parseTenderCountry } from "../../domain/tender-country";
import { parseTenderLanguage } from "../../domain/tender-language";
import { parseTenderSource } from "../../domain/tender-source";
import { toTenderSummary, type TenderSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { BUYER_REPOSITORY, type BuyerRepository } from "../ports/buyer.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";

export type UpdateTenderCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  title?: string | undefined;
  reference?: string | undefined;
  buyerName?: string | undefined;
  buyerId?: string | undefined;
  description?: string | undefined;
  publicationDate?: string | undefined;
  submissionDeadline?: string | undefined;
  submissionDeadlineTimezone?: string | undefined;
  questionsDeadline?: string | undefined;
  visitDate?: string | undefined;
  visitMandatory?: boolean | undefined;
  contractDurationMonths?: number | undefined;
  renewalDurationMonths?: number | undefined;
  renewalCount?: number | undefined;
  estimatedStartDate?: string | undefined;
  executionLocation?: string | undefined;
  geographicZone?: string | undefined;
  isFrameworkAgreement?: boolean | undefined;
  awardType?: string | undefined;
  variantsAllowed?: boolean | undefined;
  pseAllowed?: boolean | undefined;
  electronicResponseMandatory?: boolean | undefined;
  signatureRequired?: boolean | undefined;
  submissionPlatformUrl?: string | undefined;
  internalNotes?: string | undefined;
  procedureType?: string | undefined;
  marketType?: string | undefined;
  country?: string | undefined;
  language?: string | undefined;
  source?: string | undefined;
  externalReference?: string | undefined;
  sourceUrl?: string | undefined;
  estimatedAmount?: string | undefined;
  minimumAmount?: string | undefined;
  maximumAmount?: string | undefined;
  currency?: string | undefined;
  internalOwnerId?: string | undefined;
  tags?: string[] | undefined;
  requestId?: string | undefined;
}>;

export type UpdateTenderResult = TenderSummary;

@Injectable()
export class UpdateTenderUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(BUYER_REPOSITORY) private readonly buyerRepository: BuyerRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: UpdateTenderCommand): Promise<UpdateTenderResult> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    const tender = await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    if (command.buyerId !== undefined) {
      const buyer = await this.buyerRepository.findById({ organizationId: command.organizationId, buyerId: command.buyerId });
      if (!buyer) {
        throw new BuyerNotFoundError();
      }
    }

    const previousDeadline = tender.submissionDeadline?.toISOString();
    const occurredAt = this.clock.now();

    tender.updateDetails(
      {
        title: command.title,
        reference: command.reference,
        buyerName: command.buyerName,
        buyerId: command.buyerId,
        description: command.description,
        publicationDate: command.publicationDate ? new Date(command.publicationDate) : undefined,
        submissionDeadline: command.submissionDeadline ? new Date(command.submissionDeadline) : undefined,
        submissionDeadlineTimezone: command.submissionDeadlineTimezone,
        questionsDeadline: command.questionsDeadline ? new Date(command.questionsDeadline) : undefined,
        visitDate: command.visitDate ? new Date(command.visitDate) : undefined,
        visitMandatory: command.visitMandatory,
        contractDurationMonths: command.contractDurationMonths,
        renewalDurationMonths: command.renewalDurationMonths,
        renewalCount: command.renewalCount,
        estimatedStartDate: command.estimatedStartDate ? new Date(command.estimatedStartDate) : undefined,
        executionLocation: command.executionLocation,
        geographicZone: command.geographicZone,
        isFrameworkAgreement: command.isFrameworkAgreement,
        awardType: command.awardType,
        variantsAllowed: command.variantsAllowed,
        pseAllowed: command.pseAllowed,
        electronicResponseMandatory: command.electronicResponseMandatory,
        signatureRequired: command.signatureRequired,
        submissionPlatformUrl: command.submissionPlatformUrl,
        internalNotes: command.internalNotes,
        procedureType: command.procedureType,
        marketType: command.marketType !== undefined ? parseMarketType(command.marketType) : undefined,
        country: command.country !== undefined ? parseTenderCountry(command.country) : undefined,
        language: command.language !== undefined ? parseTenderLanguage(command.language) : undefined,
        source: command.source !== undefined ? parseTenderSource(command.source) : undefined,
        externalReference: command.externalReference,
        sourceUrl: command.sourceUrl,
        estimatedAmount: command.estimatedAmount,
        minimumAmount: command.minimumAmount,
        maximumAmount: command.maximumAmount,
        currency: command.currency,
        internalOwnerId: command.internalOwnerId,
        tags: command.tags,
      },
      occurredAt,
    );

    await this.tenderRepository.save(tender);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.updated",
      resourceType: "tender",
      resourceId: tender.id.value,
      requestId: command.requestId,
    });

    // Mission §20 : événement ciblé, uniquement quand l'échéance de dépôt a effectivement changé —
    // jamais à chaque modification mineure des informations générales.
    const newDeadline = tender.submissionDeadline?.toISOString();
    if (command.submissionDeadline !== undefined && newDeadline !== previousDeadline) {
      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: "TenderDeadlineChanged",
            aggregateType: "Tender",
            aggregateId: tender.id.value,
            payload: { tenderId: tender.id.value, previousDeadline, newDeadline },
            occurredAt,
          },
        ],
      });
    }

    return toTenderSummary(tender);
  }
}
