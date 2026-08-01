import { CostBreakdownLine } from "./cost-breakdown-line";
import { Money } from "./money.value-object";
import { PricingAssumptions } from "./pricing-assumptions";
import { PricingStatus } from "./pricing-status";

export type PricingEstimateVersionProps = {
  id: string;
  estimateId: string;
  organizationId: string;
  version: number;
  amount: Money;
  breakdown: readonly CostBreakdownLine[];
  assumptions: PricingAssumptions;
  status: PricingStatus;
  disclaimerVersion: number;
  /** Provenance du calcul (mission §"source des tarifs") — ex. "MANUAL", "HISTORICAL_AVERAGE". */
  source: string;
  createdBy: string;
  createdAt: Date;
  supersededAt?: Date | undefined;
  /** Renseignée uniquement pour une version > 1 (mission §"raison du recalcul"). */
  recalculationReason?: string | undefined;
};

/**
 * UNE version figée d'une estimation (mission Sprint 7 §"Versionnement des estimations" — "chaque
 * modification significative doit créer une nouvelle version... ne jamais modifier rétroactivement
 * une version historique"). Immuable après création : aucune méthode de cet objet ne modifie
 * `amount`/`breakdown`/`assumptions` — seule `supersede()` marque la transition de statut quand une
 * version suivante est créée, jamais un changement du montant figé.
 */
export class PricingEstimateVersion {
  private constructor(private props: PricingEstimateVersionProps) {}

  static create(input: Omit<PricingEstimateVersionProps, "supersededAt">): PricingEstimateVersion {
    return new PricingEstimateVersion({ ...input, supersededAt: undefined });
  }

  static rehydrate(props: PricingEstimateVersionProps): PricingEstimateVersion {
    return new PricingEstimateVersion(props);
  }

  /** Appelée UNIQUEMENT sur l'ancienne version au moment où une nouvelle est créée (voir
   *  `RecalculatePricingEstimateUseCase`) — ne touche ni le montant ni le breakdown. */
  supersede(occurredAt: Date): void {
    this.props.status = PricingStatus.Superseded;
    this.props.supersededAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get estimateId(): string {
    return this.props.estimateId;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get version(): number {
    return this.props.version;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get breakdown(): readonly CostBreakdownLine[] {
    return this.props.breakdown;
  }
  get assumptions(): PricingAssumptions {
    return this.props.assumptions;
  }
  get status(): PricingStatus {
    return this.props.status;
  }
  get disclaimerVersion(): number {
    return this.props.disclaimerVersion;
  }
  get source(): string {
    return this.props.source;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get supersededAt(): Date | undefined {
    return this.props.supersededAt;
  }
  get recalculationReason(): string | undefined {
    return this.props.recalculationReason;
  }
}
