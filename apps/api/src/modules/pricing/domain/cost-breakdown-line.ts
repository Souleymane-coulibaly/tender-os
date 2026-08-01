import { InvalidPricingAssumptionError } from "./errors";
import { Money } from "./money.value-object";
import { PricingSource } from "./pricing-source";

export type CostBreakdownLineProps = Readonly<{
  type: string;
  label: string;
  quantity?: string | undefined;
  unit?: string | undefined;
  unitPrice?: Money | undefined;
  amount: Money;
  source: PricingSource;
  displayOrder: number;
}>;

/**
 * Une ligne du détail d'une estimation (mission Sprint 7 §"Breakdown"). Valeur immuable : jamais
 * modifiée après la création de sa `PricingEstimateVersion` — un recalcul produit un NOUVEAU
 * tableau de lignes sous une nouvelle version, jamais une mutation en place.
 */
export class CostBreakdownLine {
  private constructor(private readonly props: CostBreakdownLineProps) {}

  static create(input: CostBreakdownLineProps): CostBreakdownLine {
    if (!input.type.trim() || !input.label.trim()) {
      throw new InvalidPricingAssumptionError("a breakdown line requires both a type and a label");
    }
    if (input.unitPrice && input.unitPrice.currency !== input.amount.currency) {
      throw new InvalidPricingAssumptionError("a breakdown line's unit price and amount must share the same currency");
    }
    return new CostBreakdownLine(input);
  }

  get type(): string {
    return this.props.type;
  }
  get label(): string {
    return this.props.label;
  }
  get quantity(): string | undefined {
    return this.props.quantity;
  }
  get unit(): string | undefined {
    return this.props.unit;
  }
  get unitPrice(): Money | undefined {
    return this.props.unitPrice;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get source(): PricingSource {
    return this.props.source;
  }
  get displayOrder(): number {
    return this.props.displayOrder;
  }
}
