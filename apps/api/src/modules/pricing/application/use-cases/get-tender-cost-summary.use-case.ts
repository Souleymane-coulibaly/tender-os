import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { ESTIMATE_DISCLAIMER_TEXT } from "../../domain/disclaimer";
import { PricingStatus } from "../../domain/pricing-status";
import { PricingType } from "../../domain/pricing-type";
import { toCostAggregateSummary, toPricingEstimateSummary, type CostAggregateSummary, type PricingEstimateSummary } from "../dtos";
import { GENERATION_COST_READER, type GenerationCostReader, type GenerationCostRow } from "../ports/generation-cost-reader";
import { PRICING_ESTIMATE_REPOSITORY, type PricingEstimateRepository } from "../ports/pricing-estimate.repository";
import { aggregateAiTechnicalCosts } from "../services/ai-technical-cost.service";

export type GetTenderCostSummaryQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
}>;

export type TenderCostSummary = Readonly<{
  tenderId: string;
  technicalCost: CostAggregateSummary;
  byTaskType: Readonly<Record<string, CostAggregateSummary>>;
  activeEstimate?: PricingEstimateSummary | undefined;
  disclaimerText: string;
  calculatedAt: string;
}>;

/** Mission Sprint 7 §"Pricing par Tender" — coût technique réel (Sprint 6, jamais recalculé) +
 *  l'estimation active la plus récente (non archivée), jamais fusionnés dans un même total. */
@Injectable()
export class GetTenderCostSummaryUseCase {
  constructor(
    @Inject(GENERATION_COST_READER) private readonly generationCostReader: GenerationCostReader,
    @Inject(PRICING_ESTIMATE_REPOSITORY) private readonly pricingEstimateRepository: PricingEstimateRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(query: GetTenderCostSummaryQuery): Promise<TenderCostSummary> {
    const tender = await this.getTenderUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
    });

    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadPricing,
    });

    const { items } = await this.generationCostReader.list({ organizationId: query.organizationId, tenderId: query.tenderId, limit: 10_000, offset: 0 });
    const technicalCost = toCostAggregateSummary(aggregateAiTechnicalCosts(items));

    const byTaskType: Record<string, CostAggregateSummary> = {};
    const grouped = new Map<string, GenerationCostRow[]>();
    for (const row of items) {
      const list = grouped.get(row.taskType) ?? [];
      list.push(row);
      grouped.set(row.taskType, list);
    }
    for (const [taskType, rows] of grouped) {
      byTaskType[taskType] = toCostAggregateSummary(aggregateAiTechnicalCosts(rows));
    }

    const estimates = await this.pricingEstimateRepository.list({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      type: PricingType.TenderEstimate,
      includeArchived: false,
      limit: 1,
      offset: 0,
    });
    const active = estimates.items.find((item) => item.estimate.status !== PricingStatus.Archived);

    return {
      tenderId: query.tenderId,
      technicalCost,
      byTaskType,
      activeEstimate: active ? toPricingEstimateSummary(active.estimate, active.version) : undefined,
      disclaimerText: ESTIMATE_DISCLAIMER_TEXT,
      calculatedAt: this.clock.now().toISOString(),
    };
  }
}
