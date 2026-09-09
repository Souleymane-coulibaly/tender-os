import { EngagementActPricingAlreadyFrozenError } from "./errors";

export type EngagementActProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  /** Checkpoint CCV2-E.2 — instantané IMMUABLE du candidat (voir `stampCandidate`). */
  candidateCompanyId?: string | undefined;
  reference?: string | undefined;
  lotReference?: string | undefined;
  object?: string | undefined;
  durationMonths?: number | undefined;
  variants?: string | undefined;
  subcontractingSummary?: string | undefined;
  ribDocumentId?: string | undefined;
  signatoryName?: string | undefined;
  signatoryCapacity?: string | undefined;
  administrativeDocumentId?: string | undefined;
  pricingEstimateId?: string | undefined;
  pricingEstimateVersionNumber?: number | undefined;
  frozenAmountValue?: number | undefined;
  frozenAmountCurrency?: string | undefined;
  frozenAt?: Date | undefined;
  frozenBy?: string | undefined;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Sprint 8C Phase 2 — mission §14 : l'Acte d'engagement, un par Tender. Le montant provient
 * TOUJOURS d'une version de pricing EXPLICITEMENT sélectionnée et GELÉE — jamais le dernier pricing
 * implicite (même motif exact que `Deliverable.selectCostReportEstimate`, correctif audit Codex
 * P1-002) : `freezePricing` est idempotent pour EXACTEMENT la même paire (estimateId, version),
 * refuse une AUTRE paire tant que non explicitement dégelée (`unfreezePricing`), jamais un
 * remplacement silencieux. La signature (mode/statut) vit sur l'`AdministrativeDocument` référencé
 * par `administrativeDocumentId` — jamais un second mécanisme de signature ici.
 */
export class EngagementAct {
  private constructor(private props: EngagementActProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    reference?: string | undefined;
    lotReference?: string | undefined;
    object?: string | undefined;
    durationMonths?: number | undefined;
    createdBy: string;
    occurredAt: Date;
  }): EngagementAct {
    return new EngagementAct({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      reference: input.reference,
      lotReference: input.lotReference,
      object: input.object,
      durationMonths: input.durationMonths,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: EngagementActProps): EngagementAct {
    return new EngagementAct(props);
  }

  update(input: {
    reference?: string | undefined;
    lotReference?: string | undefined;
    object?: string | undefined;
    durationMonths?: number | undefined;
    variants?: string | undefined;
    subcontractingSummary?: string | undefined;
    ribDocumentId?: string | undefined;
    signatoryName?: string | undefined;
    signatoryCapacity?: string | undefined;
    occurredAt: Date;
  }): void {
    if (input.reference !== undefined) this.props.reference = input.reference;
    if (input.lotReference !== undefined) this.props.lotReference = input.lotReference;
    if (input.object !== undefined) this.props.object = input.object;
    if (input.durationMonths !== undefined) this.props.durationMonths = input.durationMonths;
    if (input.variants !== undefined) this.props.variants = input.variants;
    if (input.subcontractingSummary !== undefined) this.props.subcontractingSummary = input.subcontractingSummary;
    if (input.ribDocumentId !== undefined) this.props.ribDocumentId = input.ribDocumentId;
    if (input.signatoryName !== undefined) this.props.signatoryName = input.signatoryName;
    if (input.signatoryCapacity !== undefined) this.props.signatoryCapacity = input.signatoryCapacity;
    this.props.updatedAt = input.occurredAt;
  }

  linkDocument(input: { administrativeDocumentId: string; occurredAt: Date }): void {
    this.props.administrativeDocumentId = input.administrativeDocumentId;
    this.props.updatedAt = input.occurredAt;
  }

  /** Correctif audit Codex P1 — jamais un montant implicite. Idempotent pour la MÊME paire,
   *  refuse une AUTRE paire tant que non dégelée. */
  freezePricing(input: { pricingEstimateId: string; pricingEstimateVersionNumber: number; amountValue: number; amountCurrency: string; frozenBy: string; occurredAt: Date }): void {
    if (
      this.props.pricingEstimateId !== undefined &&
      (this.props.pricingEstimateId !== input.pricingEstimateId || this.props.pricingEstimateVersionNumber !== input.pricingEstimateVersionNumber)
    ) {
      throw new EngagementActPricingAlreadyFrozenError();
    }
    this.props.pricingEstimateId = input.pricingEstimateId;
    this.props.pricingEstimateVersionNumber = input.pricingEstimateVersionNumber;
    this.props.frozenAmountValue = input.amountValue;
    this.props.frozenAmountCurrency = input.amountCurrency;
    this.props.frozenBy = input.frozenBy;
    this.props.frozenAt = input.occurredAt;
    this.props.updatedAt = input.occurredAt;
  }

  /** Dégèle EXPLICITEMENT — jamais implicite — pour permettre de sélectionner une autre version
   *  (mission — un recalcul Sprint 7 ultérieur ne modifie jamais un montant déjà gelé tout seul). */
  unfreezePricing(occurredAt: Date): void {
    this.props.pricingEstimateId = undefined;
    this.props.pricingEstimateVersionNumber = undefined;
    this.props.frozenAmountValue = undefined;
    this.props.frozenAmountCurrency = undefined;
    this.props.frozenAt = undefined;
    this.props.frozenBy = undefined;
    this.props.updatedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get reference(): string | undefined {
    return this.props.reference;
  }
  get lotReference(): string | undefined {
    return this.props.lotReference;
  }
  get object(): string | undefined {
    return this.props.object;
  }
  get durationMonths(): number | undefined {
    return this.props.durationMonths;
  }
  get variants(): string | undefined {
    return this.props.variants;
  }
  get subcontractingSummary(): string | undefined {
    return this.props.subcontractingSummary;
  }
  get ribDocumentId(): string | undefined {
    return this.props.ribDocumentId;
  }
  get candidateCompanyId(): string | undefined {
    return this.props.candidateCompanyId;
  }

  /**
   * Checkpoint CCV2-E.2 — pose l'instantané du candidat, UNE SEULE FOIS. Un acte renseigné pour
   * l'entreprise A reste un document de A : réécrire cet instantané vers le candidat courant
   * reviendrait à réattribuer silencieusement un engagement juridique, ce que la décision produit
   * interdit explicitement (`HISTORICAL_REVISION_MUTATION = FORBIDDEN`). Les appels suivants sont
   * donc des no-op, jamais une erreur — l'appelant n'a pas à savoir si l'instantané existe déjà.
   */
  stampCandidate(candidateCompanyId: string | undefined): void {
    if (this.props.candidateCompanyId !== undefined || candidateCompanyId === undefined) {
      return;
    }
    this.props.candidateCompanyId = candidateCompanyId;
  }

  get signatoryName(): string | undefined {
    return this.props.signatoryName;
  }
  get signatoryCapacity(): string | undefined {
    return this.props.signatoryCapacity;
  }
  get administrativeDocumentId(): string | undefined {
    return this.props.administrativeDocumentId;
  }
  get pricingEstimateId(): string | undefined {
    return this.props.pricingEstimateId;
  }
  get pricingEstimateVersionNumber(): number | undefined {
    return this.props.pricingEstimateVersionNumber;
  }
  get frozenAmountValue(): number | undefined {
    return this.props.frozenAmountValue;
  }
  get frozenAmountCurrency(): string | undefined {
    return this.props.frozenAmountCurrency;
  }
  get frozenAt(): Date | undefined {
    return this.props.frozenAt;
  }
  get frozenBy(): string | undefined {
    return this.props.frozenBy;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
