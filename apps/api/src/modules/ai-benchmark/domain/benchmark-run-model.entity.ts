import { Decimal } from "@prisma/client/runtime/library";

export type BenchmarkRunModelProps = {
  id: string;
  runId: string;
  aiModelId: string;
  pricingSnapshotId: string;
  pricingCurrency: string;
  pricingInputPricePerMillionTokens: string;
  pricingOutputPricePerMillionTokens: string;
  pricingCachedInputPricePerMillionTokens?: string | undefined;
  pricingEffectiveFrom: Date;
  pricingSource: string;
  createdAt: Date;
};

/**
 * Sélection d'un modèle pour un run (Sprint 5.2) — capture le snapshot tarifaire utilisé pour
 * l'estimation au lancement. Audit Codex P1-2 : les montants `pricing*` ci-dessous sont FIGÉS à la
 * création (copie défensive du snapshot référencé par `pricingSnapshotId`), jamais recalculés — un
 * nouveau tarif ajouté après le lancement, ou une reprise (stale recovery/retry) de ce même run, ne
 * change jamais le coût déjà estimé/à calculer pour lui. `pricingSnapshotId` reste une référence de
 * traçabilité, jamais la source de vérité relue pour le calcul.
 */
export class BenchmarkRunModel {
  private constructor(private props: BenchmarkRunModelProps) {}

  static create(input: {
    id: string;
    runId: string;
    aiModelId: string;
    pricingSnapshotId: string;
    pricingCurrency: string;
    pricingInputPricePerMillionTokens: string;
    pricingOutputPricePerMillionTokens: string;
    pricingCachedInputPricePerMillionTokens?: string | undefined;
    pricingEffectiveFrom: Date;
    pricingSource?: string | undefined;
    occurredAt: Date;
  }): BenchmarkRunModel {
    return new BenchmarkRunModel({
      id: input.id,
      runId: input.runId,
      aiModelId: input.aiModelId,
      pricingSnapshotId: input.pricingSnapshotId,
      pricingCurrency: input.pricingCurrency,
      pricingInputPricePerMillionTokens: input.pricingInputPricePerMillionTokens,
      pricingOutputPricePerMillionTokens: input.pricingOutputPricePerMillionTokens,
      pricingCachedInputPricePerMillionTokens: input.pricingCachedInputPricePerMillionTokens,
      pricingEffectiveFrom: input.pricingEffectiveFrom,
      pricingSource: input.pricingSource ?? "PRICING_SNAPSHOT",
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: BenchmarkRunModelProps): BenchmarkRunModel {
    return new BenchmarkRunModel(props);
  }

  /** Coût figé pour un nombre de tokens donné, sous le tarif capturé à la création de CETTE ligne
   *  — jamais sous le tarif courant du modèle (audit Codex P1-2). Calcul en `Decimal`, jamais
   *  `Number(...)`, pour éviter toute imprécision en virgule flottante sur un montant financier. */
  computeCost(input: { inputTokens: number; outputTokens: number }): string {
    const inputCost = new Decimal(input.inputTokens).dividedBy(1_000_000).mul(this.props.pricingInputPricePerMillionTokens);
    const outputCost = new Decimal(input.outputTokens).dividedBy(1_000_000).mul(this.props.pricingOutputPricePerMillionTokens);
    return inputCost.plus(outputCost).toFixed(6);
  }

  get id(): string {
    return this.props.id;
  }
  get runId(): string {
    return this.props.runId;
  }
  get aiModelId(): string {
    return this.props.aiModelId;
  }
  get pricingSnapshotId(): string {
    return this.props.pricingSnapshotId;
  }
  get pricingCurrency(): string {
    return this.props.pricingCurrency;
  }
  get pricingInputPricePerMillionTokens(): string {
    return this.props.pricingInputPricePerMillionTokens;
  }
  get pricingOutputPricePerMillionTokens(): string {
    return this.props.pricingOutputPricePerMillionTokens;
  }
  get pricingCachedInputPricePerMillionTokens(): string | undefined {
    return this.props.pricingCachedInputPricePerMillionTokens;
  }
  get pricingEffectiveFrom(): Date {
    return this.props.pricingEffectiveFrom;
  }
  get pricingSource(): string {
    return this.props.pricingSource;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
