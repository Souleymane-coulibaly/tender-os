import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { TenderPermission } from "../../domain/tender-permission";
import { parseMarketType } from "../../domain/market-type";
import { parseTenderCountry } from "../../domain/tender-country";
import { parseTenderLanguage } from "../../domain/tender-language";
import { parseTenderSource } from "../../domain/tender-source";
import { toTenderSummary, type TenderSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
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
  description?: string | undefined;
  publicationDate?: string | undefined;
  submissionDeadline?: string | undefined;
  procedureType?: string | undefined;
  marketType?: string | undefined;
  country?: string | undefined;
  language?: string | undefined;
  source?: string | undefined;
  externalReference?: string | undefined;
  sourceUrl?: string | undefined;
  estimatedAmount?: string | undefined;
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
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: UpdateTenderCommand): Promise<UpdateTenderResult> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    const tender = await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    tender.updateDetails(
      {
        title: command.title,
        reference: command.reference,
        buyerName: command.buyerName,
        description: command.description,
        publicationDate: command.publicationDate ? new Date(command.publicationDate) : undefined,
        submissionDeadline: command.submissionDeadline ? new Date(command.submissionDeadline) : undefined,
        procedureType: command.procedureType,
        marketType: command.marketType !== undefined ? parseMarketType(command.marketType) : undefined,
        country: command.country !== undefined ? parseTenderCountry(command.country) : undefined,
        language: command.language !== undefined ? parseTenderLanguage(command.language) : undefined,
        source: command.source !== undefined ? parseTenderSource(command.source) : undefined,
        externalReference: command.externalReference,
        sourceUrl: command.sourceUrl,
        estimatedAmount: command.estimatedAmount,
        currency: command.currency,
        internalOwnerId: command.internalOwnerId,
        tags: command.tags,
      },
      this.clock.now(),
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

    return toTenderSummary(tender);
  }
}
