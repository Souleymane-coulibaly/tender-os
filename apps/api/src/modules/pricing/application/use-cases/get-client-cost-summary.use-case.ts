import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission, GetClientAccountUseCase } from "../../../client-portfolio";
import { ESTIMATE_DISCLAIMER_TEXT } from "../../domain/disclaimer";
import { toCostAggregateSummary, type CostAggregateSummary } from "../dtos";
import { GENERATION_COST_READER, type GenerationCostReader, type GenerationCostRow } from "../ports/generation-cost-reader";
import { aggregateAiTechnicalCosts } from "../services/ai-technical-cost.service";

export type GetClientCostSummaryQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  clientAccountId: string;
  from?: Date | undefined;
  to?: Date | undefined;
}>;

export type ClientCostSummary = Readonly<{
  clientAccountId: string;
  technicalCost: CostAggregateSummary;
  byTender: Readonly<Record<string, CostAggregateSummary>>;
  disclaimerText: string;
  calculatedAt: string;
}>;

/** Mission Sprint 7 §"Pricing par client" — jamais un coût d'un autre client mélangé (filtré par
 *  `clientAccountId` réel, jamais un id fourni sans vérification — voir `GetClientAccountUseCase`). */
@Injectable()
export class GetClientCostSummaryUseCase {
  constructor(
    @Inject(GENERATION_COST_READER) private readonly generationCostReader: GenerationCostReader,
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(query: GetClientCostSummaryQuery): Promise<ClientCostSummary> {
    await this.getClientAccountUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: query.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
    });

    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: query.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadPricing,
    });

    const { items } = await this.generationCostReader.list({
      organizationId: query.organizationId,
      clientAccountId: query.clientAccountId,
      from: query.from,
      to: query.to,
      limit: 10_000,
      offset: 0,
    });

    const technicalCost = toCostAggregateSummary(aggregateAiTechnicalCosts(items));

    const byTender: Record<string, CostAggregateSummary> = {};
    const grouped = new Map<string, GenerationCostRow[]>();
    for (const row of items) {
      const list = grouped.get(row.tenderId) ?? [];
      list.push(row);
      grouped.set(row.tenderId, list);
    }
    for (const [tenderId, rows] of grouped) {
      byTender[tenderId] = toCostAggregateSummary(aggregateAiTechnicalCosts(rows));
    }

    return {
      clientAccountId: query.clientAccountId,
      technicalCost,
      byTender,
      disclaimerText: ESTIMATE_DISCLAIMER_TEXT,
      calculatedAt: this.clock.now().toISOString(),
    };
  }
}
