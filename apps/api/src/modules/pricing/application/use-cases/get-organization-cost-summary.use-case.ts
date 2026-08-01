import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ESTIMATE_DISCLAIMER_TEXT } from "../../domain/disclaimer";
import { PricingPermissionMissingError } from "../../domain/errors";
import { PricingPermission, roleHasPricingPermission } from "../../domain/pricing-permission";
import { toCostAggregateSummary, type CostAggregateSummary } from "../dtos";
import { GENERATION_COST_READER, type GenerationCostReader, type GenerationCostRow } from "../ports/generation-cost-reader";
import { aggregateAiTechnicalCosts } from "../services/ai-technical-cost.service";

export type GetOrganizationCostSummaryQuery = Readonly<{
  organizationId: string;
  actorRole: string;
  from?: Date | undefined;
  to?: Date | undefined;
}>;

export type OrganizationCostSummary = Readonly<{
  technicalCost: CostAggregateSummary;
  byClient: Readonly<Record<string, CostAggregateSummary>>;
  byTaskType: Readonly<Record<string, CostAggregateSummary>>;
  disclaimerText: string;
  calculatedAt: string;
}>;

/** Mission Sprint 7 §"Pricing par organisation" — réservé à OWNER/ORGANIZATION_ADMIN
 *  (`PricingPermission.ReadOrganizationSummary`), jamais délégable via une affectation client. Ne
 *  mélange jamais l'usage SaaS du futur Billing avec ce coût métier (mission hors périmètre). */
@Injectable()
export class GetOrganizationCostSummaryUseCase {
  constructor(
    @Inject(GENERATION_COST_READER) private readonly generationCostReader: GenerationCostReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(query: GetOrganizationCostSummaryQuery): Promise<OrganizationCostSummary> {
    if (!roleHasPricingPermission(query.actorRole, PricingPermission.ReadOrganizationSummary)) {
      throw new PricingPermissionMissingError({ permission: PricingPermission.ReadOrganizationSummary });
    }

    const { items } = await this.generationCostReader.list({
      organizationId: query.organizationId,
      from: query.from,
      to: query.to,
      limit: 50_000,
      offset: 0,
    });

    const technicalCost = toCostAggregateSummary(aggregateAiTechnicalCosts(items));

    const byClient: Record<string, CostAggregateSummary> = {};
    const byTaskType: Record<string, CostAggregateSummary> = {};
    const groupedByClient = new Map<string, GenerationCostRow[]>();
    const groupedByTaskType = new Map<string, GenerationCostRow[]>();
    for (const row of items) {
      const clientList = groupedByClient.get(row.clientAccountId) ?? [];
      clientList.push(row);
      groupedByClient.set(row.clientAccountId, clientList);

      const taskList = groupedByTaskType.get(row.taskType) ?? [];
      taskList.push(row);
      groupedByTaskType.set(row.taskType, taskList);
    }
    for (const [clientAccountId, rows] of groupedByClient) {
      byClient[clientAccountId] = toCostAggregateSummary(aggregateAiTechnicalCosts(rows));
    }
    for (const [taskType, rows] of groupedByTaskType) {
      byTaskType[taskType] = toCostAggregateSummary(aggregateAiTechnicalCosts(rows));
    }

    return {
      technicalCost,
      byClient,
      byTaskType,
      disclaimerText: ESTIMATE_DISCLAIMER_TEXT,
      calculatedAt: this.clock.now().toISOString(),
    };
  }
}
