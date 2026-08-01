import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { ESTIMATE_DISCLAIMER_TEXT } from "../../domain/disclaimer";
import { InvalidPricingScopeError, PricingEstimateNotFoundError } from "../../domain/errors";
import { toPricingEstimateSummary, type PricingEstimateSummary } from "../dtos";
import { GENERATION_COST_READER, type GenerationCostReader } from "../ports/generation-cost-reader";
import { PRICING_ESTIMATE_REPOSITORY, type PricingEstimateRepository } from "../ports/pricing-estimate.repository";
import { aggregateAiTechnicalCosts } from "../services/ai-technical-cost.service";

export type CompareEstimatedAndActualCostQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  estimateId: string;
}>;

export type CostComparison = Readonly<{
  estimate: PricingEstimateSummary;
  estimatedAiCostAmount?: string | undefined;
  actualAiCostAmount?: string | undefined;
  currency?: string | undefined;
  /** `undefined` si le réel est inconnu, ou si les devises diffèrent (mission §"ne pas diviser par
   *  zéro" + "aucune agrégation directe entre devises différentes"). */
  absoluteDifference?: string | undefined;
  percentageDifference?: string | undefined;
  actualStatus: "AVAILABLE" | "UNKNOWN" | "CURRENCY_MISMATCH";
  disclaimerText: string;
  comparedAt: string;
}>;

/**
 * Mission Sprint 7 §"Comparaison estimé/réel" — ne recalcule JAMAIS la version comparée (lue telle
 * quelle), compare uniquement la ligne `AI_COST` de son breakdown (la seule composante ayant un
 * pendant réel mesurable — le temps de préparation/les frais n'ont pas de "coût réel" issu de
 * Sprint 6) au coût technique réel agrégé du même Tender.
 */
@Injectable()
export class CompareEstimatedAndActualCostUseCase {
  constructor(
    @Inject(PRICING_ESTIMATE_REPOSITORY) private readonly pricingEstimateRepository: PricingEstimateRepository,
    @Inject(GENERATION_COST_READER) private readonly generationCostReader: GenerationCostReader,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(query: CompareEstimatedAndActualCostQuery): Promise<CostComparison> {
    const found = await this.pricingEstimateRepository.findById({ organizationId: query.organizationId, estimateId: query.estimateId });
    if (!found) {
      throw new PricingEstimateNotFoundError();
    }
    const { estimate, version } = found;

    if (!estimate.clientAccountId || !estimate.tenderId) {
      throw new InvalidPricingScopeError("only a Tender-scoped estimate can be compared to an actual cost");
    }

    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: estimate.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadPricing,
    });

    const aiCostLine = version.breakdown.find((line) => line.type === "AI_COST");

    const { items } = await this.generationCostReader.list({ organizationId: query.organizationId, tenderId: estimate.tenderId, limit: 10_000, offset: 0 });
    const actualAggregate = aggregateAiTechnicalCosts(items);
    const actualCurrencies = Object.keys(actualAggregate.totalsByCurrency);

    let actualStatus: CostComparison["actualStatus"] = "UNKNOWN";
    let actualAiCostAmount: string | undefined;
    let absoluteDifference: string | undefined;
    let percentageDifference: string | undefined;
    let currency: string | undefined = aiCostLine?.amount.currency;

    if (aiCostLine && actualCurrencies.length === 1) {
      const actual = actualAggregate.totalsByCurrency[actualCurrencies[0]!]!;
      if (actual.currency !== aiCostLine.amount.currency) {
        actualStatus = "CURRENCY_MISMATCH";
      } else {
        actualAiCostAmount = actual.toFixed();
        currency = actual.currency;
        actualStatus = "AVAILABLE";
        absoluteDifference = actual.differenceFrom(aiCostLine.amount);
        percentageDifference = actual.percentageDifferenceFrom(aiCostLine.amount);
      }
    } else if (aiCostLine && actualCurrencies.length > 1) {
      actualStatus = "CURRENCY_MISMATCH";
    }

    return {
      estimate: toPricingEstimateSummary(estimate, version),
      estimatedAiCostAmount: aiCostLine?.amount.toFixed(),
      actualAiCostAmount,
      currency,
      absoluteDifference,
      percentageDifference,
      actualStatus,
      disclaimerText: ESTIMATE_DISCLAIMER_TEXT,
      comparedAt: this.clock.now().toISOString(),
    };
  }
}
