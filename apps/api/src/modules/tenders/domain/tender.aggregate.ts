import { ALLOWED_TENDER_TRANSITIONS, TenderStatus } from "./tender-status";
import { InvalidTenderStatusTransitionError, TenderArchivedError } from "./errors";
import { TenderId } from "./tender-id.value-object";

export type TenderProps = {
  id: TenderId;
  organizationId: string;
  title: string;
  reference?: string | undefined;
  buyerName?: string | undefined;
  description?: string | undefined;
  publicationDate?: Date | undefined;
  submissionDeadline?: Date | undefined;
  procedureType?: string | undefined;
  marketType?: string | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
  internalOwnerId?: string | undefined;
  status: TenderStatus;
  tags: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | undefined;
  version: number;
};

export type TenderDetailsUpdate = {
  title?: string | undefined;
  reference?: string | undefined;
  buyerName?: string | undefined;
  description?: string | undefined;
  publicationDate?: Date | undefined;
  submissionDeadline?: Date | undefined;
  procedureType?: string | undefined;
  marketType?: string | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
  internalOwnerId?: string | undefined;
  tags?: string[] | undefined;
};

/**
 * Appel d'offres en préparation de réponse — voir l'en-tête de `schema.prisma` pour la
 * distinction avec le `Tender` de découverte documenté (non implémenté ici).
 */
export class Tender {
  private constructor(private props: TenderProps) {}

  static create(input: {
    id: TenderId;
    organizationId: string;
    title: string;
    reference?: string | undefined;
    buyerName?: string | undefined;
    description?: string | undefined;
    publicationDate?: Date | undefined;
    submissionDeadline?: Date | undefined;
    procedureType?: string | undefined;
    marketType?: string | undefined;
    estimatedAmount?: string | undefined;
    currency?: string | undefined;
    internalOwnerId?: string | undefined;
    tags?: string[] | undefined;
    createdBy: string;
    occurredAt: Date;
  }): Tender {
    return new Tender({
      id: input.id,
      organizationId: input.organizationId,
      title: input.title,
      reference: input.reference,
      buyerName: input.buyerName,
      description: input.description,
      publicationDate: input.publicationDate,
      submissionDeadline: input.submissionDeadline,
      procedureType: input.procedureType,
      marketType: input.marketType,
      estimatedAmount: input.estimatedAmount,
      currency: input.currency,
      internalOwnerId: input.internalOwnerId,
      status: TenderStatus.Draft,
      tags: input.tags ?? [],
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      archivedAt: undefined,
      version: 1,
    });
  }

  static rehydrate(props: TenderProps): Tender {
    return new Tender(props);
  }

  updateDetails(update: TenderDetailsUpdate, occurredAt: Date): void {
    this.assertNotArchived();

    if (update.title !== undefined) this.props.title = update.title;
    if (update.reference !== undefined) this.props.reference = update.reference;
    if (update.buyerName !== undefined) this.props.buyerName = update.buyerName;
    if (update.description !== undefined) this.props.description = update.description;
    if (update.publicationDate !== undefined) this.props.publicationDate = update.publicationDate;
    if (update.submissionDeadline !== undefined) this.props.submissionDeadline = update.submissionDeadline;
    if (update.procedureType !== undefined) this.props.procedureType = update.procedureType;
    if (update.marketType !== undefined) this.props.marketType = update.marketType;
    if (update.estimatedAmount !== undefined) this.props.estimatedAmount = update.estimatedAmount;
    if (update.currency !== undefined) this.props.currency = update.currency;
    if (update.internalOwnerId !== undefined) this.props.internalOwnerId = update.internalOwnerId;
    if (update.tags !== undefined) this.props.tags = update.tags;

    this.props.updatedAt = occurredAt;
    this.props.version += 1;
  }

  /**
   * Transition de statut explicite (mission §4) — la validation de "règles prévues" avant
   * SUBMITTED se limite ici à l'ordre du funnel (venir de READY_TO_SUBMIT) ; aucune règle de
   * complétude (checklist, pièces...) n'est documentée comme bloquante au niveau du Domain —
   * un score de préparation insuffisant reste informatif, pas un verrou (mission §13).
   */
  changeStatus(nextStatus: TenderStatus, occurredAt: Date): void {
    const allowed = ALLOWED_TENDER_TRANSITIONS[this.props.status];

    if (!allowed.includes(nextStatus)) {
      throw new InvalidTenderStatusTransitionError({ from: this.props.status, to: nextStatus });
    }

    this.props.status = nextStatus;
    this.props.updatedAt = occurredAt;
    this.props.version += 1;

    if (nextStatus === TenderStatus.Archived) {
      this.props.archivedAt = occurredAt;
    }
  }

  private assertNotArchived(): void {
    if (this.props.status === TenderStatus.Archived) {
      throw new TenderArchivedError();
    }
  }

  get id(): TenderId {
    return this.props.id;
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get title(): string {
    return this.props.title;
  }

  get reference(): string | undefined {
    return this.props.reference;
  }

  get buyerName(): string | undefined {
    return this.props.buyerName;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get publicationDate(): Date | undefined {
    return this.props.publicationDate;
  }

  get submissionDeadline(): Date | undefined {
    return this.props.submissionDeadline;
  }

  get procedureType(): string | undefined {
    return this.props.procedureType;
  }

  get marketType(): string | undefined {
    return this.props.marketType;
  }

  get estimatedAmount(): string | undefined {
    return this.props.estimatedAmount;
  }

  get currency(): string | undefined {
    return this.props.currency;
  }

  get internalOwnerId(): string | undefined {
    return this.props.internalOwnerId;
  }

  get status(): TenderStatus {
    return this.props.status;
  }

  get tags(): string[] {
    return this.props.tags;
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

  get archivedAt(): Date | undefined {
    return this.props.archivedAt;
  }

  get version(): number {
    return this.props.version;
  }
}
