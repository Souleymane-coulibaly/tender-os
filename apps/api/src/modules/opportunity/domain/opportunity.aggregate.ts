import { ALLOWED_OPPORTUNITY_TRANSITIONS, OpportunityStatus } from "./opportunity-status";
import { OpportunityArchivedError, OpportunityNotFoundError, InvalidOpportunityStatusTransitionError } from "./errors";
import { parseEstimatedAmount } from "./estimated-amount";
import { OpportunityId } from "./opportunity-id.value-object";
import type { OpportunitySource } from "./opportunity-source";

export type OpportunityProps = {
  id: OpportunityId;
  organizationId: string;
  clientAccountId?: string | undefined;
  buyerId?: string | undefined;
  title: string;
  description?: string | undefined;
  source: OpportunitySource;
  externalReference?: string | undefined;
  buyerName?: string | undefined;
  sector?: string | undefined;
  cpvCode?: string | undefined;
  location?: string | undefined;
  geographicZone?: string | undefined;
  publicationDate?: Date | undefined;
  submissionDeadline?: Date | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
  procedureType?: string | undefined;
  status: OpportunityStatus;
  tenderId?: string | undefined;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | undefined;
  version: number;
};

export type OpportunityDetailsUpdate = {
  clientAccountId?: string | undefined;
  buyerId?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  source?: OpportunitySource | undefined;
  externalReference?: string | undefined;
  buyerName?: string | undefined;
  sector?: string | undefined;
  cpvCode?: string | undefined;
  location?: string | undefined;
  geographicZone?: string | undefined;
  publicationDate?: Date | undefined;
  submissionDeadline?: Date | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
  procedureType?: string | undefined;
};

/**
 * Opportunité de préqualification (mission Sprint 5 §4) — voir l'en-tête de `schema.prisma` pour
 * la vue d'ensemble. `clientAccountId`/`buyerId` restent nullables tout au long du cycle de vie
 * (mission §23 "permettre quand même une décision humaine" malgré des données manquantes) ; seule
 * la promotion (`PromoteOpportunityToTenderUseCase`, hors de cet agrégat) exige un
 * `clientAccountId` résolu.
 */
export class Opportunity {
  private constructor(private props: OpportunityProps) {}

  static create(input: {
    id: OpportunityId;
    organizationId: string;
    clientAccountId?: string | undefined;
    buyerId?: string | undefined;
    title: string;
    description?: string | undefined;
    source?: OpportunitySource | undefined;
    externalReference?: string | undefined;
    buyerName?: string | undefined;
    sector?: string | undefined;
    cpvCode?: string | undefined;
    location?: string | undefined;
    geographicZone?: string | undefined;
    publicationDate?: Date | undefined;
    submissionDeadline?: Date | undefined;
    estimatedAmount?: string | undefined;
    currency?: string | undefined;
    procedureType?: string | undefined;
    createdBy: string;
    occurredAt: Date;
  }): Opportunity {
    const estimatedAmount = input.estimatedAmount !== undefined ? parseEstimatedAmount(input.estimatedAmount) : undefined;

    return new Opportunity({
      id: input.id,
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      buyerId: input.buyerId,
      title: input.title,
      description: input.description,
      source: input.source ?? "MANUAL",
      externalReference: input.externalReference,
      buyerName: input.buyerName,
      sector: input.sector,
      cpvCode: input.cpvCode,
      location: input.location,
      geographicZone: input.geographicZone,
      publicationDate: input.publicationDate,
      submissionDeadline: input.submissionDeadline,
      estimatedAmount,
      currency: input.currency,
      procedureType: input.procedureType,
      status: OpportunityStatus.Draft,
      tenderId: undefined,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      archivedAt: undefined,
      version: 1,
    });
  }

  static rehydrate(props: OpportunityProps): Opportunity {
    return new Opportunity(props);
  }

  updateDetails(update: OpportunityDetailsUpdate, occurredAt: Date): void {
    this.assertNotArchived();

    if (update.clientAccountId !== undefined) this.props.clientAccountId = update.clientAccountId;
    if (update.buyerId !== undefined) this.props.buyerId = update.buyerId;
    if (update.title !== undefined) this.props.title = update.title;
    if (update.description !== undefined) this.props.description = update.description;
    if (update.source !== undefined) this.props.source = update.source;
    if (update.externalReference !== undefined) this.props.externalReference = update.externalReference;
    if (update.buyerName !== undefined) this.props.buyerName = update.buyerName;
    if (update.sector !== undefined) this.props.sector = update.sector;
    if (update.cpvCode !== undefined) this.props.cpvCode = update.cpvCode;
    if (update.location !== undefined) this.props.location = update.location;
    if (update.geographicZone !== undefined) this.props.geographicZone = update.geographicZone;
    if (update.publicationDate !== undefined) this.props.publicationDate = update.publicationDate;
    if (update.submissionDeadline !== undefined) this.props.submissionDeadline = update.submissionDeadline;
    if (update.estimatedAmount !== undefined) this.props.estimatedAmount = parseEstimatedAmount(update.estimatedAmount);
    if (update.currency !== undefined) this.props.currency = update.currency;
    if (update.procedureType !== undefined) this.props.procedureType = update.procedureType;

    this.props.updatedAt = occurredAt;
    this.props.version += 1;
  }

  /**
   * Transition de statut (mission §5). Le DOMAINE connaît l'ensemble complet des transitions
   * valides (y compris vers GO/GO_CONDITIONAL/NO_GO) ; c'est la COUCHE APPLICATION qui restreint
   * quelles transitions chaque use case expose (`ChangeOpportunityStatusUseCase` n'autorise que le
   * funnel amont DRAFT/TO_QUALIFY/QUALIFIED/DISMISSED/ARCHIVED ; seul
   * `RecordOpportunityGoNoGoDecisionUseCase` déclenche GO/GO_CONDITIONAL/NO_GO, jamais exposé
   * comme un mouvement de statut libre).
   */
  changeStatus(nextStatus: OpportunityStatus, occurredAt: Date): void {
    const allowed = ALLOWED_OPPORTUNITY_TRANSITIONS[this.props.status];

    if (!allowed.includes(nextStatus)) {
      throw new InvalidOpportunityStatusTransitionError({ from: this.props.status, to: nextStatus });
    }

    this.props.status = nextStatus;
    this.props.updatedAt = occurredAt;
    this.props.version += 1;

    if (nextStatus === OpportunityStatus.Archived) {
      this.props.archivedAt = occurredAt;
    } else if (this.props.archivedAt !== undefined) {
      this.props.archivedAt = undefined;
    }
  }

  /** Appelée UNIQUEMENT par `PromoteOpportunityToTenderUseCase`, après la réservation atomique
   *  (compare-and-set) côté repository — cette méthode ne fait que documenter/lier le résultat sur
   *  l'agrégat en mémoire, jamais la garde de concurrence elle-même (portée par le repository). */
  linkPromotedTender(tenderId: string, occurredAt: Date): void {
    this.props.tenderId = tenderId;
    this.props.updatedAt = occurredAt;
    this.props.version += 1;
  }

  private assertNotArchived(): void {
    if (this.props.status === OpportunityStatus.Archived) {
      throw new OpportunityArchivedError();
    }
  }

  get id(): OpportunityId {
    return this.props.id;
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get clientAccountId(): string | undefined {
    return this.props.clientAccountId;
  }

  get buyerId(): string | undefined {
    return this.props.buyerId;
  }

  get title(): string {
    return this.props.title;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get source(): OpportunitySource {
    return this.props.source;
  }

  get externalReference(): string | undefined {
    return this.props.externalReference;
  }

  get buyerName(): string | undefined {
    return this.props.buyerName;
  }

  get sector(): string | undefined {
    return this.props.sector;
  }

  get cpvCode(): string | undefined {
    return this.props.cpvCode;
  }

  get location(): string | undefined {
    return this.props.location;
  }

  get geographicZone(): string | undefined {
    return this.props.geographicZone;
  }

  get publicationDate(): Date | undefined {
    return this.props.publicationDate;
  }

  get submissionDeadline(): Date | undefined {
    return this.props.submissionDeadline;
  }

  get estimatedAmount(): string | undefined {
    return this.props.estimatedAmount;
  }

  get currency(): string | undefined {
    return this.props.currency;
  }

  get procedureType(): string | undefined {
    return this.props.procedureType;
  }

  get status(): OpportunityStatus {
    return this.props.status;
  }

  get tenderId(): string | undefined {
    return this.props.tenderId;
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

/** Utilisé par les use cases qui doivent charger une Opportunity avant de la muter — jamais un
 *  `null`/`undefined` silencieux (mission "jamais de contournement"). */
export function assertOpportunityFound(opportunity: Opportunity | null): Opportunity {
  if (!opportunity) {
    throw new OpportunityNotFoundError();
  }
  return opportunity;
}
