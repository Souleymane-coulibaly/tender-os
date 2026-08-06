import { ALLOWED_TENDER_TRANSITIONS, TenderStatus } from "./tender-status";
import {
  InvalidTenderAmountRangeError,
  InvalidTenderEstimatedAmountError,
  InvalidTenderStatusTransitionError,
  TenderArchivedError,
  TenderCandidateChangeNotAllowedError,
} from "./errors";
import { isAmountRangeValid, isValidAmountFormat } from "./estimated-amount";
import { TenderId } from "./tender-id.value-object";
import type { MarketType } from "./market-type";
import type { TenderCountry } from "./tender-country";
import type { TenderLanguage } from "./tender-language";
import type { TenderSource } from "./tender-source";

/** V2 Sprint 3 — correctif audit Codex P1 : mêmes règles Decimal(19,4) qu'un lot
 *  (`parseEstimatedAmount`), mais avec l'erreur propre au Tender (`InvalidTenderEstimatedAmountError`,
 *  jamais `InvalidLotEstimatedAmountError` qui désignerait à tort un lot). */
function parseTenderAmount(value: string): string {
  if (!isValidAmountFormat(value)) {
    throw new InvalidTenderEstimatedAmountError({ value });
  }
  return value;
}

/** minimumAmount ne peut jamais dépasser maximumAmount lorsque les deux sont renseignés — vérifié
 *  sur l'état RÉSULTANT (jamais seulement les champs modifiés), pour couvrir le cas où une mise à
 *  jour partielle ne touche qu'un seul des deux bornes. */
function assertAmountRange(minimumAmount: string | undefined, maximumAmount: string | undefined): void {
  if (!isAmountRangeValid(minimumAmount, maximumAmount)) {
    throw new InvalidTenderAmountRangeError();
  }
}

/** V2 Sprint 3 §4 — statuts au-delà desquels changer l'entreprise candidate est interdit : passé
 *  DRAFT/IN_ANALYSIS, la préparation de la réponse a réellement commencé (lots, critères, pièces,
 *  dossier administratif...) et la ré-attribuer à une autre entreprise candidate romprait la
 *  cohérence de tout ce qui a déjà été produit. Mission §4 "définir précisément les conditions" —
 *  cette règle est la définition retenue, volontairement simple et alignée sur le funnel de statut
 *  déjà existant plutôt qu'une nouvelle notion de "données déjà ajoutées" à calculer dynamiquement. */
const CANDIDATE_CHANGE_ALLOWED_STATUSES: readonly TenderStatus[] = [TenderStatus.Draft, TenderStatus.InAnalysis];

export type TenderProps = {
  id: TenderId;
  organizationId: string;
  /** Mission Sprint 5.1 §"Tenders" — obligatoire depuis la création. V2 Sprint 3 §4 : modifiable
   *  UNIQUEMENT via `changeClientAccount`, jamais via `updateDetails` (volontairement absent de
   *  `TenderDetailsUpdate`), et seulement tant que le Tender est en DRAFT/IN_ANALYSIS. */
  clientAccountId: string;
  title: string;
  reference?: string | undefined;
  buyerName?: string | undefined;
  /** V2 Sprint 3 §5 — acheteur structuré, distinct du candidat. Modifiable via `updateDetails`
   *  (aucune règle de contrôle documentée pour l'acheteur, contrairement au candidat). */
  buyerId?: string | undefined;
  description?: string | undefined;
  publicationDate?: Date | undefined;
  submissionDeadline?: Date | undefined;
  submissionDeadlineTimezone?: string | undefined;
  questionsDeadline?: Date | undefined;
  visitDate?: Date | undefined;
  visitMandatory?: boolean | undefined;
  contractDurationMonths?: number | undefined;
  renewalDurationMonths?: number | undefined;
  renewalCount?: number | undefined;
  estimatedStartDate?: Date | undefined;
  executionLocation?: string | undefined;
  geographicZone?: string | undefined;
  isFrameworkAgreement?: boolean | undefined;
  awardType?: string | undefined;
  variantsAllowed?: boolean | undefined;
  pseAllowed?: boolean | undefined;
  electronicResponseMandatory?: boolean | undefined;
  signatureRequired?: boolean | undefined;
  submissionPlatformUrl?: string | undefined;
  internalNotes?: string | undefined;
  procedureType?: string | undefined;
  marketType?: MarketType | undefined;
  country?: TenderCountry | undefined;
  language?: TenderLanguage | undefined;
  source?: TenderSource | undefined;
  externalReference?: string | undefined;
  sourceUrl?: string | undefined;
  estimatedAmount?: string | undefined;
  minimumAmount?: string | undefined;
  maximumAmount?: string | undefined;
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
  buyerId?: string | undefined;
  description?: string | undefined;
  publicationDate?: Date | undefined;
  submissionDeadline?: Date | undefined;
  submissionDeadlineTimezone?: string | undefined;
  questionsDeadline?: Date | undefined;
  visitDate?: Date | undefined;
  visitMandatory?: boolean | undefined;
  contractDurationMonths?: number | undefined;
  renewalDurationMonths?: number | undefined;
  renewalCount?: number | undefined;
  estimatedStartDate?: Date | undefined;
  executionLocation?: string | undefined;
  geographicZone?: string | undefined;
  isFrameworkAgreement?: boolean | undefined;
  awardType?: string | undefined;
  variantsAllowed?: boolean | undefined;
  pseAllowed?: boolean | undefined;
  electronicResponseMandatory?: boolean | undefined;
  signatureRequired?: boolean | undefined;
  submissionPlatformUrl?: string | undefined;
  internalNotes?: string | undefined;
  procedureType?: string | undefined;
  marketType?: MarketType | undefined;
  country?: TenderCountry | undefined;
  language?: TenderLanguage | undefined;
  source?: TenderSource | undefined;
  externalReference?: string | undefined;
  sourceUrl?: string | undefined;
  estimatedAmount?: string | undefined;
  minimumAmount?: string | undefined;
  maximumAmount?: string | undefined;
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
    clientAccountId: string;
    title: string;
    reference?: string | undefined;
    buyerName?: string | undefined;
    buyerId?: string | undefined;
    description?: string | undefined;
    publicationDate?: Date | undefined;
    submissionDeadline?: Date | undefined;
    submissionDeadlineTimezone?: string | undefined;
    questionsDeadline?: Date | undefined;
    visitDate?: Date | undefined;
    visitMandatory?: boolean | undefined;
    contractDurationMonths?: number | undefined;
    renewalDurationMonths?: number | undefined;
    renewalCount?: number | undefined;
    estimatedStartDate?: Date | undefined;
    executionLocation?: string | undefined;
    geographicZone?: string | undefined;
    isFrameworkAgreement?: boolean | undefined;
    awardType?: string | undefined;
    variantsAllowed?: boolean | undefined;
    pseAllowed?: boolean | undefined;
    electronicResponseMandatory?: boolean | undefined;
    signatureRequired?: boolean | undefined;
    submissionPlatformUrl?: string | undefined;
    internalNotes?: string | undefined;
    procedureType?: string | undefined;
    marketType?: MarketType | undefined;
    country?: TenderCountry | undefined;
    language?: TenderLanguage | undefined;
    source?: TenderSource | undefined;
    externalReference?: string | undefined;
    sourceUrl?: string | undefined;
    estimatedAmount?: string | undefined;
    minimumAmount?: string | undefined;
    maximumAmount?: string | undefined;
    currency?: string | undefined;
    internalOwnerId?: string | undefined;
    tags?: string[] | undefined;
    createdBy: string;
    occurredAt: Date;
  }): Tender {
    const estimatedAmount = input.estimatedAmount !== undefined ? parseTenderAmount(input.estimatedAmount) : undefined;
    const minimumAmount = input.minimumAmount !== undefined ? parseTenderAmount(input.minimumAmount) : undefined;
    const maximumAmount = input.maximumAmount !== undefined ? parseTenderAmount(input.maximumAmount) : undefined;
    assertAmountRange(minimumAmount, maximumAmount);

    return new Tender({
      id: input.id,
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      title: input.title,
      reference: input.reference,
      buyerName: input.buyerName,
      buyerId: input.buyerId,
      description: input.description,
      publicationDate: input.publicationDate,
      submissionDeadline: input.submissionDeadline,
      submissionDeadlineTimezone: input.submissionDeadlineTimezone,
      questionsDeadline: input.questionsDeadline,
      visitDate: input.visitDate,
      visitMandatory: input.visitMandatory,
      contractDurationMonths: input.contractDurationMonths,
      renewalDurationMonths: input.renewalDurationMonths,
      renewalCount: input.renewalCount,
      estimatedStartDate: input.estimatedStartDate,
      executionLocation: input.executionLocation,
      geographicZone: input.geographicZone,
      isFrameworkAgreement: input.isFrameworkAgreement,
      awardType: input.awardType,
      variantsAllowed: input.variantsAllowed,
      pseAllowed: input.pseAllowed,
      electronicResponseMandatory: input.electronicResponseMandatory,
      signatureRequired: input.signatureRequired,
      submissionPlatformUrl: input.submissionPlatformUrl,
      internalNotes: input.internalNotes,
      procedureType: input.procedureType,
      marketType: input.marketType,
      country: input.country,
      language: input.language,
      source: input.source,
      externalReference: input.externalReference,
      sourceUrl: input.sourceUrl,
      estimatedAmount,
      minimumAmount,
      maximumAmount,
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
    if (update.buyerId !== undefined) this.props.buyerId = update.buyerId;
    if (update.description !== undefined) this.props.description = update.description;
    if (update.publicationDate !== undefined) this.props.publicationDate = update.publicationDate;
    if (update.submissionDeadline !== undefined) this.props.submissionDeadline = update.submissionDeadline;
    if (update.submissionDeadlineTimezone !== undefined) this.props.submissionDeadlineTimezone = update.submissionDeadlineTimezone;
    if (update.questionsDeadline !== undefined) this.props.questionsDeadline = update.questionsDeadline;
    if (update.visitDate !== undefined) this.props.visitDate = update.visitDate;
    if (update.visitMandatory !== undefined) this.props.visitMandatory = update.visitMandatory;
    if (update.contractDurationMonths !== undefined) this.props.contractDurationMonths = update.contractDurationMonths;
    if (update.renewalDurationMonths !== undefined) this.props.renewalDurationMonths = update.renewalDurationMonths;
    if (update.renewalCount !== undefined) this.props.renewalCount = update.renewalCount;
    if (update.estimatedStartDate !== undefined) this.props.estimatedStartDate = update.estimatedStartDate;
    if (update.executionLocation !== undefined) this.props.executionLocation = update.executionLocation;
    if (update.geographicZone !== undefined) this.props.geographicZone = update.geographicZone;
    if (update.isFrameworkAgreement !== undefined) this.props.isFrameworkAgreement = update.isFrameworkAgreement;
    if (update.awardType !== undefined) this.props.awardType = update.awardType;
    if (update.variantsAllowed !== undefined) this.props.variantsAllowed = update.variantsAllowed;
    if (update.pseAllowed !== undefined) this.props.pseAllowed = update.pseAllowed;
    if (update.electronicResponseMandatory !== undefined) this.props.electronicResponseMandatory = update.electronicResponseMandatory;
    if (update.signatureRequired !== undefined) this.props.signatureRequired = update.signatureRequired;
    if (update.submissionPlatformUrl !== undefined) this.props.submissionPlatformUrl = update.submissionPlatformUrl;
    if (update.internalNotes !== undefined) this.props.internalNotes = update.internalNotes;
    if (update.procedureType !== undefined) this.props.procedureType = update.procedureType;
    if (update.marketType !== undefined) this.props.marketType = update.marketType;
    if (update.country !== undefined) this.props.country = update.country;
    if (update.language !== undefined) this.props.language = update.language;
    if (update.source !== undefined) this.props.source = update.source;
    if (update.externalReference !== undefined) this.props.externalReference = update.externalReference;
    if (update.sourceUrl !== undefined) this.props.sourceUrl = update.sourceUrl;
    if (update.estimatedAmount !== undefined) this.props.estimatedAmount = parseTenderAmount(update.estimatedAmount);
    if (update.minimumAmount !== undefined) this.props.minimumAmount = parseTenderAmount(update.minimumAmount);
    if (update.maximumAmount !== undefined) this.props.maximumAmount = parseTenderAmount(update.maximumAmount);
    if (update.currency !== undefined) this.props.currency = update.currency;
    if (update.internalOwnerId !== undefined) this.props.internalOwnerId = update.internalOwnerId;
    if (update.tags !== undefined) this.props.tags = update.tags;

    // Correctif audit Codex P1 — vérifié sur l'état RÉSULTANT (jamais seulement les champs
    // modifiés dans cet appel), pour couvrir une mise à jour partielle qui ne touche qu'une borne.
    assertAmountRange(this.props.minimumAmount, this.props.maximumAmount);

    this.props.updatedAt = occurredAt;
    this.props.version += 1;
  }

  /**
   * V2 Sprint 3 §4 — changement CONTRÔLÉ de l'entreprise candidate : jamais via `updateDetails`,
   * uniquement depuis DRAFT/IN_ANALYSIS (voir `CANDIDATE_CHANGE_ALLOWED_STATUSES`). L'appelant
   * (use-case) reste responsable de vérifier que la nouvelle entreprise candidate existe, appartient
   * à la même organisation, n'est pas archivée, et que l'acteur y a accès — cette méthode ne
   * connaît que la RÈGLE DE STATUT, jamais les règles Client Portfolio (frontière de module).
   */
  changeClientAccount(clientAccountId: string, occurredAt: Date): void {
    this.assertNotArchived();
    if (!CANDIDATE_CHANGE_ALLOWED_STATUSES.includes(this.props.status)) {
      throw new TenderCandidateChangeNotAllowedError({ status: this.props.status });
    }
    this.props.clientAccountId = clientAccountId;
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
    } else if (this.props.archivedAt !== undefined) {
      // V2 Sprint 3 §7 — restauration (ARCHIVED -> DRAFT) : efface la marque d'archivage.
      this.props.archivedAt = undefined;
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

  get clientAccountId(): string {
    return this.props.clientAccountId;
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

  get buyerId(): string | undefined {
    return this.props.buyerId;
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

  get submissionDeadlineTimezone(): string | undefined {
    return this.props.submissionDeadlineTimezone;
  }

  get questionsDeadline(): Date | undefined {
    return this.props.questionsDeadline;
  }

  get visitDate(): Date | undefined {
    return this.props.visitDate;
  }

  get visitMandatory(): boolean | undefined {
    return this.props.visitMandatory;
  }

  get contractDurationMonths(): number | undefined {
    return this.props.contractDurationMonths;
  }

  get renewalDurationMonths(): number | undefined {
    return this.props.renewalDurationMonths;
  }

  get renewalCount(): number | undefined {
    return this.props.renewalCount;
  }

  get estimatedStartDate(): Date | undefined {
    return this.props.estimatedStartDate;
  }

  get executionLocation(): string | undefined {
    return this.props.executionLocation;
  }

  get geographicZone(): string | undefined {
    return this.props.geographicZone;
  }

  get isFrameworkAgreement(): boolean | undefined {
    return this.props.isFrameworkAgreement;
  }

  get awardType(): string | undefined {
    return this.props.awardType;
  }

  get variantsAllowed(): boolean | undefined {
    return this.props.variantsAllowed;
  }

  get pseAllowed(): boolean | undefined {
    return this.props.pseAllowed;
  }

  get electronicResponseMandatory(): boolean | undefined {
    return this.props.electronicResponseMandatory;
  }

  get signatureRequired(): boolean | undefined {
    return this.props.signatureRequired;
  }

  get submissionPlatformUrl(): string | undefined {
    return this.props.submissionPlatformUrl;
  }

  get internalNotes(): string | undefined {
    return this.props.internalNotes;
  }

  get procedureType(): string | undefined {
    return this.props.procedureType;
  }

  get marketType(): MarketType | undefined {
    return this.props.marketType;
  }

  get country(): TenderCountry | undefined {
    return this.props.country;
  }

  get language(): TenderLanguage | undefined {
    return this.props.language;
  }

  get source(): TenderSource | undefined {
    return this.props.source;
  }

  get externalReference(): string | undefined {
    return this.props.externalReference;
  }

  get sourceUrl(): string | undefined {
    return this.props.sourceUrl;
  }

  get estimatedAmount(): string | undefined {
    return this.props.estimatedAmount;
  }

  get minimumAmount(): string | undefined {
    return this.props.minimumAmount;
  }

  get maximumAmount(): string | undefined {
    return this.props.maximumAmount;
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
