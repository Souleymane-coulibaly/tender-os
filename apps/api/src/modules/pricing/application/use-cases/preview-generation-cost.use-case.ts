import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { PricingAssumptions } from "../../domain/pricing-assumptions";
import { ESTIMATE_DISCLAIMER_TEXT, ESTIMATE_DISCLAIMER_VERSION } from "../../domain/disclaimer";
import { toBreakdownLineSummary, type BreakdownLineSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { GENERATION_COST_READER, type GenerationCostReader } from "../ports/generation-cost-reader";
import { PRICING_SNAPSHOT_READER, type PricingSnapshotReader } from "../ports/pricing-snapshot-reader";
import { ROUTING_MODEL_READER, type RoutingModelReader } from "../ports/routing-model-reader";
import { calculateEstimateBreakdown } from "../services/estimate-calculation.service";

export type PreviewGenerationCostCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  taskType: string;
  estimatedGenerationsCount?: number | undefined;
  estimatedInputTokensPerGeneration?: number | undefined;
  estimatedOutputTokensPerGeneration?: number | undefined;
}>;

export type PreviewGenerationCostResult = {
  amount?: string | undefined;
  currency?: string | undefined;
  breakdown: BreakdownLineSummary[];
  status: string;
  modelProvider?: string | undefined;
  modelKey?: string | undefined;
  usedHistoricalAverage: boolean;
  disclaimerVersion: number;
  disclaimerText: string;
  calculatedAt: string;
};

/**
 * Mission Sprint 7 §"Prévision avant génération" — jamais persistée (contrairement à
 * `CreatePricingEstimateUseCase`), une simple lecture composée pour aider un utilisateur AVANT de
 * lancer réellement une génération. Si l'utilisateur ne fournit pas de volume de tokens estimé, une
 * moyenne historique de l'organisation pour ce `taskType` est utilisée EXPLICITEMENT signalée
 * (`usedHistoricalAverage: true`) — jamais présentée comme une donnée certaine.
 */
@Injectable()
export class PreviewGenerationCostUseCase {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(ROUTING_MODEL_READER) private readonly routingModelReader: RoutingModelReader,
    @Inject(PRICING_SNAPSHOT_READER) private readonly pricingSnapshotReader: PricingSnapshotReader,
    @Inject(GENERATION_COST_READER) private readonly generationCostReader: GenerationCostReader,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: PreviewGenerationCostCommand): Promise<PreviewGenerationCostResult> {
    const tender = await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });

    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManagePricing,
    });

    const routedModel = await this.routingModelReader.resolveActiveModel({
      organizationId: command.organizationId,
      taskType: command.taskType,
    });
    const modelPricing = routedModel ? await this.pricingSnapshotReader.findCurrentForModel({ aiModelId: routedModel.aiModelId }) : null;

    let usedHistoricalAverage = false;
    let inputTokens = command.estimatedInputTokensPerGeneration;
    let outputTokens = command.estimatedOutputTokensPerGeneration;
    if (inputTokens === undefined && outputTokens === undefined) {
      const average = await this.generationCostReader.averageTokensForTaskType({
        organizationId: command.organizationId,
        taskType: command.taskType,
      });
      if (average) {
        inputTokens = average.averageInputTokens;
        outputTokens = average.averageOutputTokens;
        usedHistoricalAverage = true;
      }
    }

    const assumptions = PricingAssumptions.create({
      taskTypes: [command.taskType],
      estimatedGenerationsCount: command.estimatedGenerationsCount ?? 1,
      estimatedInputTokensPerGeneration: inputTokens,
      estimatedOutputTokensPerGeneration: outputTokens,
    });

    let amount: string | undefined;
    let currency: string | undefined;
    let breakdown: BreakdownLineSummary[] = [];
    let status = "UNKNOWN";
    try {
      const result = calculateEstimateBreakdown({ assumptions, modelPricing: modelPricing ?? undefined });
      amount = result.amount.toFixed();
      currency = result.amount.currency;
      breakdown = result.breakdown.map(toBreakdownLineSummary);
      status = result.status;
    } catch {
      // Aucune hypothèse exploitable (mission §"ne pas afficher 0€ par défaut") — reste UNKNOWN.
    }

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "pricing.preview_generation_cost",
      resourceType: "tender",
      resourceId: command.tenderId,
      metadata: { taskType: command.taskType, status },
    });

    return {
      amount,
      currency,
      breakdown,
      status,
      modelProvider: routedModel?.provider,
      modelKey: routedModel?.modelKey,
      usedHistoricalAverage,
      disclaimerVersion: ESTIMATE_DISCLAIMER_VERSION,
      disclaimerText: ESTIMATE_DISCLAIMER_TEXT,
      calculatedAt: this.clock.now().toISOString(),
    };
  }
}
