import { InvalidLotAmountRangeError, TenderLotDeletedError, TenderLotNotDeletedError } from "./errors";
import { isAmountRangeValid, parseEstimatedAmount } from "./estimated-amount";

/** Vérifiée sur l'état RÉSULTANT (jamais seulement les champs modifiés) — même motif que
 *  Tender.assertAmountRange (audit Codex P1, 2e passe), pour couvrir le cas où seule une des deux
 *  bornes est modifiée face à l'autre déjà en base. */
function assertLotAmountRange(minimumAmount: string | undefined, maximumAmount: string | undefined): void {
  if (!isAmountRangeValid(minimumAmount, maximumAmount)) {
    throw new InvalidLotAmountRangeError();
  }
}

export type TenderLotProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  lotNumber: string;
  title: string;
  description?: string | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
  displayOrder: number;
  /** V2 Sprint 3 §8 — enrichissement additif. Pas de colonne "status" distincte : `deletedAt`
   *  porte déjà l'archivage/la restauration (mission "ne pas dupliquer"). */
  code?: string | undefined;
  cpvMain?: string | undefined;
  cpvSecondary: string[];
  executionLocation?: string | undefined;
  durationMonths?: number | undefined;
  estimatedStartDate?: Date | undefined;
  minimumAmount?: string | undefined;
  maximumAmount?: string | undefined;
  selectedForResponse: boolean;
  soloAllowed: boolean;
  groupAllowed: boolean;
  variantsAllowed?: boolean | undefined;
  pseAllowed?: boolean | undefined;
  specificVisitRequired?: boolean | undefined;
  specificVisitDate?: Date | undefined;
  internalNotes?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | undefined;
};

export type TenderLotUpdate = {
  title?: string | undefined;
  description?: string | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
  code?: string | undefined;
  cpvMain?: string | undefined;
  cpvSecondary?: string[] | undefined;
  executionLocation?: string | undefined;
  durationMonths?: number | undefined;
  estimatedStartDate?: Date | undefined;
  minimumAmount?: string | undefined;
  maximumAmount?: string | undefined;
  selectedForResponse?: boolean | undefined;
  soloAllowed?: boolean | undefined;
  groupAllowed?: boolean | undefined;
  variantsAllowed?: boolean | undefined;
  pseAllowed?: boolean | undefined;
  specificVisitRequired?: boolean | undefined;
  specificVisitDate?: Date | undefined;
  internalNotes?: string | undefined;
};

/**
 * Entité enfant de l'agrégat Tender (conception validée §B) — jamais un agrégat indépendant,
 * cohérent avec TenderChecklistItem/TenderAwardCriterion/TenderRequestedDocument. `lotNumber` et
 * `tenderId`/`organizationId` ne sont jamais modifiables après création (conception §B, §E) :
 * aucune méthode ne les expose en écriture.
 */
export class TenderLot {
  private constructor(private props: TenderLotProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    lotNumber: string;
    title: string;
    description?: string | undefined;
    estimatedAmount?: string | undefined;
    currency?: string | undefined;
    displayOrder: number;
    code?: string | undefined;
    cpvMain?: string | undefined;
    cpvSecondary?: string[] | undefined;
    executionLocation?: string | undefined;
    durationMonths?: number | undefined;
    estimatedStartDate?: Date | undefined;
    minimumAmount?: string | undefined;
    maximumAmount?: string | undefined;
    selectedForResponse?: boolean | undefined;
    soloAllowed?: boolean | undefined;
    groupAllowed?: boolean | undefined;
    variantsAllowed?: boolean | undefined;
    pseAllowed?: boolean | undefined;
    specificVisitRequired?: boolean | undefined;
    specificVisitDate?: Date | undefined;
    internalNotes?: string | undefined;
    occurredAt: Date;
  }): TenderLot {
    const minimumAmount = input.minimumAmount !== undefined ? parseEstimatedAmount(input.minimumAmount) : undefined;
    const maximumAmount = input.maximumAmount !== undefined ? parseEstimatedAmount(input.maximumAmount) : undefined;
    assertLotAmountRange(minimumAmount, maximumAmount);

    return new TenderLot({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      lotNumber: input.lotNumber,
      title: input.title,
      description: input.description,
      estimatedAmount: input.estimatedAmount !== undefined ? parseEstimatedAmount(input.estimatedAmount) : undefined,
      currency: input.currency,
      displayOrder: input.displayOrder,
      code: input.code,
      cpvMain: input.cpvMain,
      cpvSecondary: input.cpvSecondary ?? [],
      executionLocation: input.executionLocation,
      durationMonths: input.durationMonths,
      estimatedStartDate: input.estimatedStartDate,
      minimumAmount,
      maximumAmount,
      selectedForResponse: input.selectedForResponse ?? true,
      soloAllowed: input.soloAllowed ?? true,
      groupAllowed: input.groupAllowed ?? true,
      variantsAllowed: input.variantsAllowed,
      pseAllowed: input.pseAllowed,
      specificVisitRequired: input.specificVisitRequired,
      specificVisitDate: input.specificVisitDate,
      internalNotes: input.internalNotes,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      deletedAt: undefined,
    });
  }

  static rehydrate(props: TenderLotProps): TenderLot {
    return new TenderLot(props);
  }

  update(update: TenderLotUpdate, occurredAt: Date): void {
    this.assertNotDeleted();
    if (update.title !== undefined) this.props.title = update.title;
    if (update.description !== undefined) this.props.description = update.description;
    if (update.estimatedAmount !== undefined) this.props.estimatedAmount = parseEstimatedAmount(update.estimatedAmount);
    if (update.currency !== undefined) this.props.currency = update.currency;
    if (update.code !== undefined) this.props.code = update.code;
    if (update.cpvMain !== undefined) this.props.cpvMain = update.cpvMain;
    if (update.cpvSecondary !== undefined) this.props.cpvSecondary = update.cpvSecondary;
    if (update.executionLocation !== undefined) this.props.executionLocation = update.executionLocation;
    if (update.durationMonths !== undefined) this.props.durationMonths = update.durationMonths;
    if (update.estimatedStartDate !== undefined) this.props.estimatedStartDate = update.estimatedStartDate;
    if (update.minimumAmount !== undefined) this.props.minimumAmount = parseEstimatedAmount(update.minimumAmount);
    if (update.maximumAmount !== undefined) this.props.maximumAmount = parseEstimatedAmount(update.maximumAmount);
    assertLotAmountRange(this.props.minimumAmount, this.props.maximumAmount);
    if (update.selectedForResponse !== undefined) this.props.selectedForResponse = update.selectedForResponse;
    if (update.soloAllowed !== undefined) this.props.soloAllowed = update.soloAllowed;
    if (update.groupAllowed !== undefined) this.props.groupAllowed = update.groupAllowed;
    if (update.variantsAllowed !== undefined) this.props.variantsAllowed = update.variantsAllowed;
    if (update.pseAllowed !== undefined) this.props.pseAllowed = update.pseAllowed;
    if (update.specificVisitRequired !== undefined) this.props.specificVisitRequired = update.specificVisitRequired;
    if (update.specificVisitDate !== undefined) this.props.specificVisitDate = update.specificVisitDate;
    if (update.internalNotes !== undefined) this.props.internalNotes = update.internalNotes;
    this.props.updatedAt = occurredAt;
  }

  /** Réassigne la position — jamais appelée directement par CreateTenderLot ou UpdateTenderLot
   *  (conception §D, §E) : seuls ReorderTenderLots et le calcul atomique de fin de liste du
   *  repository (AUDIT-002, createAppendedAtEnd) modifient `displayOrder`. */
  reorder(displayOrder: number, occurredAt: Date): void {
    this.assertNotDeleted();
    this.props.displayOrder = displayOrder;
    this.props.updatedAt = occurredAt;
  }

  softDelete(occurredAt: Date): void {
    this.assertNotDeleted();
    this.props.deletedAt = occurredAt;
    this.props.updatedAt = occurredAt;
  }

  /** Le numéro de lot reste réservé même supprimé (conception §D) : restaurer ne peut jamais
   *  entrer en collision avec un lot créé entretemps. Repositionné en fin de liste actuelle
   *  plutôt qu'à son ancienne position (conception §E — simplicité). */
  restore(displayOrder: number, occurredAt: Date): void {
    if (this.props.deletedAt === undefined) {
      throw new TenderLotNotDeletedError();
    }
    this.props.deletedAt = undefined;
    this.props.displayOrder = displayOrder;
    this.props.updatedAt = occurredAt;
  }

  private assertNotDeleted(): void {
    if (this.props.deletedAt !== undefined) {
      throw new TenderLotDeletedError();
    }
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
  get lotNumber(): string {
    return this.props.lotNumber;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string | undefined {
    return this.props.description;
  }
  get estimatedAmount(): string | undefined {
    return this.props.estimatedAmount;
  }
  get currency(): string | undefined {
    return this.props.currency;
  }
  get displayOrder(): number {
    return this.props.displayOrder;
  }
  get code(): string | undefined {
    return this.props.code;
  }
  get cpvMain(): string | undefined {
    return this.props.cpvMain;
  }
  get cpvSecondary(): string[] {
    return this.props.cpvSecondary;
  }
  get executionLocation(): string | undefined {
    return this.props.executionLocation;
  }
  get durationMonths(): number | undefined {
    return this.props.durationMonths;
  }
  get estimatedStartDate(): Date | undefined {
    return this.props.estimatedStartDate;
  }
  get minimumAmount(): string | undefined {
    return this.props.minimumAmount;
  }
  get maximumAmount(): string | undefined {
    return this.props.maximumAmount;
  }
  get selectedForResponse(): boolean {
    return this.props.selectedForResponse;
  }
  get soloAllowed(): boolean {
    return this.props.soloAllowed;
  }
  get groupAllowed(): boolean {
    return this.props.groupAllowed;
  }
  get variantsAllowed(): boolean | undefined {
    return this.props.variantsAllowed;
  }
  get pseAllowed(): boolean | undefined {
    return this.props.pseAllowed;
  }
  get specificVisitRequired(): boolean | undefined {
    return this.props.specificVisitRequired;
  }
  get specificVisitDate(): Date | undefined {
    return this.props.specificVisitDate;
  }
  get internalNotes(): string | undefined {
    return this.props.internalNotes;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get deletedAt(): Date | undefined {
    return this.props.deletedAt;
  }
}
