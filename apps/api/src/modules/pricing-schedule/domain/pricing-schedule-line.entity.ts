import { Decimal } from "@prisma/client/runtime/library";
import { NonPriceableLineError } from "./errors";
import { PricingScheduleLineKind, PricingScheduleLineStatus } from "./enums";

/** Mission §26 — mode avancé optionnel : main d'œuvre + matériel + équipement + sous-traitance +
 *  frais + marge. Purement informatif au niveau du domaine — `setUnitPrice` reste le SEUL moyen de
 *  fixer `proposedUnitPrice` (mission §27/§28 "l'IA ne choisit jamais le prix final", le prix reste
 *  toujours explicitement modifiable même quand un détail de coût est renseigné). */
export type PricingScheduleLineCostBreakdown = Readonly<{
  laborCost?: string | undefined;
  materialCost?: string | undefined;
  equipmentCost?: string | undefined;
  subcontractingCost?: string | undefined;
  overheadCost?: string | undefined;
  marginValue?: string | undefined;
  marginRate?: string | undefined;
}>;

export type PricingScheduleLineProps = {
  id: string;
  organizationId: string;
  pricingScheduleVersionId: string;
  sheetName: string;
  rowNumber: number;
  kind: PricingScheduleLineKind;
  hierarchyLevel: number;
  parentLineId?: string | undefined;
  /** Données ACHETEUR verrouillées (mission §29/§30) — sciemment sans aucun setter public : la
   *  seule façon de les faire changer est de créer une nouvelle ligne (nouvelle extraction/version),
   *  jamais une mutation en place. */
  designation: string;
  unit?: string | undefined;
  quantity?: string | undefined;
  designationCellRef?: string | undefined;
  quantityCellRef?: string | undefined;
  buyerUnitPriceCellRef?: string | undefined;
  buyerTotalCellRef?: string | undefined;
  proposedUnitPrice?: string | undefined;
  proposedTotal?: string | undefined;
  currencyCode: string;
  costBreakdown?: PricingScheduleLineCostBreakdown | undefined;
  candidateComment?: string | undefined;
  status: PricingScheduleLineStatus;
  matchingKey?: string | undefined;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

/** Une ligne extraite du classeur acheteur (mission §15) — appartient à UNE `PricingScheduleVersion`
 *  précise. Mission §45 : une fois la version parente VALIDATED, plus aucune mutation ne doit être
 *  appelée sur cette ligne (le use-case appelant est responsable de vérifier
 *  `PricingScheduleVersion.isValidated` AVANT tout appel — la ligne elle-même n'a pas connaissance
 *  du statut de sa version, même motif d'orchestration que le reste de ce dépôt : chaque entité ne
 *  connaît que ses propres invariants). */
export class PricingScheduleLine {
  private constructor(private props: PricingScheduleLineProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    pricingScheduleVersionId: string;
    sheetName: string;
    rowNumber: number;
    kind: PricingScheduleLineKind;
    hierarchyLevel?: number | undefined;
    parentLineId?: string | undefined;
    designation: string;
    unit?: string | undefined;
    quantity?: string | undefined;
    designationCellRef?: string | undefined;
    quantityCellRef?: string | undefined;
    buyerUnitPriceCellRef?: string | undefined;
    buyerTotalCellRef?: string | undefined;
    currencyCode?: string | undefined;
    matchingKey?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
    occurredAt: Date;
  }): PricingScheduleLine {
    return new PricingScheduleLine({
      id: input.id,
      organizationId: input.organizationId,
      pricingScheduleVersionId: input.pricingScheduleVersionId,
      sheetName: input.sheetName,
      rowNumber: input.rowNumber,
      kind: input.kind,
      hierarchyLevel: input.hierarchyLevel ?? 0,
      parentLineId: input.parentLineId,
      designation: input.designation,
      unit: input.unit,
      quantity: input.quantity,
      designationCellRef: input.designationCellRef,
      quantityCellRef: input.quantityCellRef,
      buyerUnitPriceCellRef: input.buyerUnitPriceCellRef,
      buyerTotalCellRef: input.buyerTotalCellRef,
      currencyCode: input.currencyCode ?? "EUR",
      status: PricingScheduleLineStatus.Empty,
      matchingKey: input.matchingKey,
      metadata: input.metadata ?? {},
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: PricingScheduleLineProps): PricingScheduleLine {
    return new PricingScheduleLine(props);
  }

  private assertPriceable(): void {
    if (this.props.kind !== PricingScheduleLineKind.PriceItem) {
      throw new NonPriceableLineError(this.props.kind);
    }
  }

  /** Mission §33 — `total = quantity × unitPrice` pour une ligne simple, calculé exclusivement en
   *  `Decimal` (jamais `Number`, jamais un arrondi intermédiaire perdu). Si `quantity` est absente
   *  (structure atypique), `proposedTotal` reste non renseigné plutôt qu'une valeur inventée — la
   *  ligne passe alors NEEDS_REVIEW, jamais silencieusement PRICED. */
  setUnitPrice(input: { unitPrice: string; occurredAt: Date }): void {
    this.assertPriceable();
    const unitPrice = new Decimal(input.unitPrice);
    this.props.proposedUnitPrice = unitPrice.toFixed(6);
    if (this.props.quantity !== undefined) {
      this.props.proposedTotal = unitPrice.times(new Decimal(this.props.quantity)).toFixed(6);
      this.props.status = PricingScheduleLineStatus.Priced;
    } else {
      this.props.proposedTotal = undefined;
      this.props.status = PricingScheduleLineStatus.NeedsReview;
    }
    this.props.updatedAt = input.occurredAt;
  }

  /** Mission §26 — informatif uniquement, ne modifie jamais `proposedUnitPrice`/`proposedTotal` :
   *  seul `setUnitPrice` (appelé explicitement, potentiellement avec une valeur dérivée de ce détail
   *  par le use-case appelant) fixe le prix réel. */
  setCostBreakdown(input: { costBreakdown: PricingScheduleLineCostBreakdown | undefined; occurredAt: Date }): void {
    this.assertPriceable();
    this.props.costBreakdown = input.costBreakdown;
    this.props.updatedAt = input.occurredAt;
  }

  setCandidateComment(input: { candidateComment: string | undefined; occurredAt: Date }): void {
    this.props.candidateComment = input.candidateComment;
    this.props.updatedAt = input.occurredAt;
  }

  /** Mission §38 — rapprochement BPU/DQE ambigu ou colonnes non mappées : jamais une fusion
   *  automatique sur simple similarité, seulement un signal explicite pour revue humaine. */
  flagNeedsReview(occurredAt: Date): void {
    this.props.status = PricingScheduleLineStatus.NeedsReview;
    this.props.updatedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get pricingScheduleVersionId(): string {
    return this.props.pricingScheduleVersionId;
  }
  get sheetName(): string {
    return this.props.sheetName;
  }
  get rowNumber(): number {
    return this.props.rowNumber;
  }
  get kind(): PricingScheduleLineKind {
    return this.props.kind;
  }
  get hierarchyLevel(): number {
    return this.props.hierarchyLevel;
  }
  get parentLineId(): string | undefined {
    return this.props.parentLineId;
  }
  get designation(): string {
    return this.props.designation;
  }
  get unit(): string | undefined {
    return this.props.unit;
  }
  get quantity(): string | undefined {
    return this.props.quantity;
  }
  get designationCellRef(): string | undefined {
    return this.props.designationCellRef;
  }
  get quantityCellRef(): string | undefined {
    return this.props.quantityCellRef;
  }
  get buyerUnitPriceCellRef(): string | undefined {
    return this.props.buyerUnitPriceCellRef;
  }
  get buyerTotalCellRef(): string | undefined {
    return this.props.buyerTotalCellRef;
  }
  get proposedUnitPrice(): string | undefined {
    return this.props.proposedUnitPrice;
  }
  get proposedTotal(): string | undefined {
    return this.props.proposedTotal;
  }
  get currencyCode(): string {
    return this.props.currencyCode;
  }
  get costBreakdown(): PricingScheduleLineCostBreakdown | undefined {
    return this.props.costBreakdown;
  }
  get candidateComment(): string | undefined {
    return this.props.candidateComment;
  }
  get status(): PricingScheduleLineStatus {
    return this.props.status;
  }
  get matchingKey(): string | undefined {
    return this.props.matchingKey;
  }
  get metadata(): Record<string, unknown> {
    return this.props.metadata;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
