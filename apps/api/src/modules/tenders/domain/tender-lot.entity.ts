import { TenderLotDeletedError, TenderLotNotDeletedError } from "./errors";
import { parseEstimatedAmount } from "./estimated-amount";

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
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | undefined;
};

export type TenderLotUpdate = {
  title?: string | undefined;
  description?: string | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
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
    occurredAt: Date;
  }): TenderLot {
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
