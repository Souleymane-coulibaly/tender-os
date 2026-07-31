import { Decimal } from "@prisma/client/runtime/library";

export type AiModelPricingSnapshotProps = {
  id: string;
  aiModelId: string;
  inputPricePerMillionTokens: string;
  outputPricePerMillionTokens: string;
  currency: string;
  effectiveFrom: Date;
  effectiveTo?: Date | undefined;
  createdAt: Date;
};

/**
 * Tarif d'un modèle valable sur une période (Sprint 5.2 §"Les tarifs des modèles doivent être
 * versionnés ou configurables" + §"une mise à jour de tarif ne doit pas modifier rétroactivement
 * les coûts historiques"). Immuable une fois close : `close()` fige `effectiveTo`, jamais une
 * réécriture des montants. Un `BenchmarkCaseResult`/`AnalysisJob` référence l'id du snapshot
 * effectivement utilisé au moment de l'appel, jamais un JOIN "tarif actuel".
 */
export class AiModelPricingSnapshot {
  private constructor(private props: AiModelPricingSnapshotProps) {}

  static create(input: {
    id: string;
    aiModelId: string;
    inputPricePerMillionTokens: string;
    outputPricePerMillionTokens: string;
    currency: string;
    occurredAt: Date;
  }): AiModelPricingSnapshot {
    return new AiModelPricingSnapshot({
      id: input.id,
      aiModelId: input.aiModelId,
      inputPricePerMillionTokens: input.inputPricePerMillionTokens,
      outputPricePerMillionTokens: input.outputPricePerMillionTokens,
      currency: input.currency,
      effectiveFrom: input.occurredAt,
      effectiveTo: undefined,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: AiModelPricingSnapshotProps): AiModelPricingSnapshot {
    return new AiModelPricingSnapshot(props);
  }

  close(occurredAt: Date): void {
    this.props.effectiveTo = occurredAt;
  }

  get isCurrent(): boolean {
    return this.props.effectiveTo === undefined;
  }

  /** Coût estimé pour un nombre de tokens donné, sous ce tarif exact — jamais recalculé sous un
   *  tarif différent une fois le résultat persisté (voir docstring de classe). Audit Codex P1-2 :
   *  calculé exclusivement via `Decimal` (jamais `Number(...)`, qui introduit une imprécision en
   *  virgule flottante sur des montants financiers, notamment avec un grand nombre de tokens). */
  estimateCost(input: { inputTokens: number; outputTokens: number }): string {
    const inputCost = new Decimal(input.inputTokens).dividedBy(1_000_000).mul(this.props.inputPricePerMillionTokens);
    const outputCost = new Decimal(input.outputTokens).dividedBy(1_000_000).mul(this.props.outputPricePerMillionTokens);
    return inputCost.plus(outputCost).toFixed(6);
  }

  get id(): string {
    return this.props.id;
  }
  get aiModelId(): string {
    return this.props.aiModelId;
  }
  get inputPricePerMillionTokens(): string {
    return this.props.inputPricePerMillionTokens;
  }
  get outputPricePerMillionTokens(): string {
    return this.props.outputPricePerMillionTokens;
  }
  get currency(): string {
    return this.props.currency;
  }
  get effectiveFrom(): Date {
    return this.props.effectiveFrom;
  }
  get effectiveTo(): Date | undefined {
    return this.props.effectiveTo;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
