import { InvalidEmailFrequencyError, SavedSearchNotFoundError } from "./errors";
import { EmailFrequency, isEmailFrequency } from "./enums";
import type { SavedSearchCriteria, SavedSearchCriteriaInput } from "./services/matching-engine";

export type SavedSearchProps = {
  id: string;
  organizationId: string;
  ownerUserId: string;
  clientAccountId?: string | undefined;
  name: string;
  criteria: SavedSearchCriteria;
  alertInApp: boolean;
  alertEmail: boolean;
  emailFrequency: string;
  isActive: boolean;
  lastDigestSentAt?: Date | undefined;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | undefined;
};

/** Fusionne explicitement champ par champ — un simple spread `{...base, ...patch}` ne suffit pas
 *  sous `exactOptionalPropertyTypes: true` : `patch` (`SavedSearchCriteriaInput`) type chaque champ
 *  `X | undefined`, et TS ne peut pas prouver statiquement qu'un champ absent du patch produit
 *  `undefined` au lieu de simplement ne pas apparaître — `??` lève l'ambiguïté explicitement. */
function mergeCriteria(base: SavedSearchCriteria, patch: SavedSearchCriteriaInput | undefined): SavedSearchCriteria {
  return {
    includeKeywords: patch?.includeKeywords ?? base.includeKeywords,
    excludeKeywords: patch?.excludeKeywords ?? base.excludeKeywords,
    cpvCodes: patch?.cpvCodes ?? base.cpvCodes,
    countries: patch?.countries ?? base.countries,
    regions: patch?.regions ?? base.regions,
    departments: patch?.departments ?? base.departments,
    cities: patch?.cities ?? base.cities,
    marketTypes: patch?.marketTypes ?? base.marketTypes,
    sources: patch?.sources ?? base.sources,
    minAmount: patch?.minAmount ?? base.minAmount,
    maxAmount: patch?.maxAmount ?? base.maxAmount,
    includeUnknownAmount: patch?.includeUnknownAmount ?? base.includeUnknownAmount,
    publishedAfter: patch?.publishedAfter ?? base.publishedAfter,
    deadlineAfterDays: patch?.deadlineAfterDays ?? base.deadlineAfterDays,
    deadlineBeforeDate: patch?.deadlineBeforeDate ?? base.deadlineBeforeDate,
    procedureTypes: patch?.procedureTypes ?? base.procedureTypes,
  };
}

const EMPTY_CRITERIA: SavedSearchCriteria = {
  includeKeywords: [],
  excludeKeywords: [],
  cpvCodes: [],
  countries: [],
  regions: [],
  departments: [],
  cities: [],
  marketTypes: [],
  sources: [],
  minAmount: undefined,
  maxAmount: undefined,
  includeUnknownAmount: true,
  publishedAfter: undefined,
  deadlineAfterDays: undefined,
  deadlineBeforeDate: undefined,
  procedureTypes: [],
};

/** Mission §15 — profil de veille personnel (PERSONAL uniquement ce sprint, mission §16). */
export class SavedSearch {
  private constructor(private props: SavedSearchProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    ownerUserId: string;
    clientAccountId?: string | undefined;
    name: string;
    criteria?: SavedSearchCriteriaInput | undefined;
    alertInApp?: boolean | undefined;
    alertEmail?: boolean | undefined;
    emailFrequency?: string | undefined;
    createdBy: string;
    occurredAt: Date;
  }): SavedSearch {
    const emailFrequency = input.emailFrequency ?? EmailFrequency.DailyDigest;
    if (!isEmailFrequency(emailFrequency)) {
      throw new InvalidEmailFrequencyError(emailFrequency);
    }
    return new SavedSearch({
      id: input.id,
      organizationId: input.organizationId,
      ownerUserId: input.ownerUserId,
      clientAccountId: input.clientAccountId,
      name: input.name,
      criteria: mergeCriteria(EMPTY_CRITERIA, input.criteria),
      alertInApp: input.alertInApp ?? true,
      alertEmail: input.alertEmail ?? false,
      emailFrequency,
      isActive: true,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: SavedSearchProps): SavedSearch {
    return new SavedSearch(props);
  }

  /** Mission §17 — jamais modifiable par un autre utilisateur que le propriétaire, quel que soit
   *  son rôle organisationnel (aucun bypass OWNER/ADMIN : une veille reste strictement
   *  personnelle). Lève `SavedSearchNotFoundError` (pas une erreur "ownership" dédiée) — même
   *  convention anti-énumération que tout le reste du code (mission §101/§102 style, Sprint 16) :
   *  un 403 confirmerait qu'une veille appartenant à quelqu'un d'autre existe à cet id. */
  assertOwnedBy(userId: string): void {
    if (this.props.ownerUserId !== userId) {
      throw new SavedSearchNotFoundError();
    }
  }

  update(input: {
    name?: string | undefined;
    clientAccountId?: string | null | undefined;
    criteria?: SavedSearchCriteriaInput | undefined;
    alertInApp?: boolean | undefined;
    alertEmail?: boolean | undefined;
    emailFrequency?: string | undefined;
    occurredAt: Date;
  }): void {
    if (input.emailFrequency !== undefined && !isEmailFrequency(input.emailFrequency)) {
      throw new InvalidEmailFrequencyError(input.emailFrequency);
    }
    this.props = {
      ...this.props,
      name: input.name ?? this.props.name,
      clientAccountId: input.clientAccountId === null ? undefined : (input.clientAccountId ?? this.props.clientAccountId),
      criteria: input.criteria ? mergeCriteria(this.props.criteria, input.criteria) : this.props.criteria,
      alertInApp: input.alertInApp ?? this.props.alertInApp,
      alertEmail: input.alertEmail ?? this.props.alertEmail,
      emailFrequency: input.emailFrequency ?? this.props.emailFrequency,
      updatedAt: input.occurredAt,
    };
  }

  /** Mission §115 — plus de nouveaux matches/alertes, jamais de suppression des ExternalTenders. */
  setActive(isActive: boolean, occurredAt: Date): void {
    this.props.isActive = isActive;
    this.props.updatedAt = occurredAt;
  }

  softDelete(occurredAt: Date): void {
    this.props.isActive = false;
    this.props.deletedAt = occurredAt;
    this.props.updatedAt = occurredAt;
  }

  recordDigestSent(occurredAt: Date): void {
    this.props.lastDigestSentAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get ownerUserId(): string {
    return this.props.ownerUserId;
  }
  get clientAccountId(): string | undefined {
    return this.props.clientAccountId;
  }
  get name(): string {
    return this.props.name;
  }
  get criteria(): SavedSearchCriteria {
    return this.props.criteria;
  }
  get alertInApp(): boolean {
    return this.props.alertInApp;
  }
  get alertEmail(): boolean {
    return this.props.alertEmail;
  }
  get emailFrequency(): string {
    return this.props.emailFrequency;
  }
  get isActive(): boolean {
    return this.props.isActive && this.props.deletedAt === undefined;
  }
  get lastDigestSentAt(): Date | undefined {
    return this.props.lastDigestSentAt;
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
  get deletedAt(): Date | undefined {
    return this.props.deletedAt;
  }
}
