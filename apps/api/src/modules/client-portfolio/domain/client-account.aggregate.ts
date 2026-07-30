import { ALLOWED_CLIENT_ACCOUNT_TRANSITIONS, ClientAccountStatus } from "./client-account-status";
import { normalizeClientAccountName } from "./client-name-normalizer";
import { ClientAccountArchivedError, ClientAccountNotArchivedError, InvalidClientAccountStatusTransitionError } from "./errors";

export type ClientAccountProps = {
  id: string;
  organizationId: string;
  name: string;
  nameNormalized: string;
  legalName?: string | undefined;
  reference?: string | undefined;
  sector?: string | undefined;
  country?: string | undefined;
  address?: string | undefined;
  website?: string | undefined;
  notes?: string | undefined;
  status: ClientAccountStatus;
  createdBy: string;
  updatedBy?: string | undefined;
  archivedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/** Jamais de `status` ici — la transition de statut passe UNIQUEMENT par `archive()`/`restore()`
 *  (mission §"invariants" + parité avec `KnowledgeEntry.updateMetadata`, Sprint 5). */
export type ClientAccountDetailsUpdate = {
  name?: string | undefined;
  legalName?: string | undefined;
  reference?: string | undefined;
  sector?: string | undefined;
  country?: string | undefined;
  address?: string | undefined;
  website?: string | undefined;
  notes?: string | undefined;
};

/**
 * Client géré par l'organisation (mission Sprint 5.1 §"ClientAccount") — jamais une chaîne libre
 * pour le statut (mission §"Ne pas utiliser une simple chaîne libre pour le statut"). Ne connaît
 * ni Prisma, ni NestJS, ni Next.js — uniquement son propre cycle de vie.
 */
export class ClientAccount {
  private constructor(private props: ClientAccountProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    name: string;
    legalName?: string | undefined;
    reference?: string | undefined;
    sector?: string | undefined;
    country?: string | undefined;
    address?: string | undefined;
    website?: string | undefined;
    notes?: string | undefined;
    /** Statut initial (mission §"statut initial" du formulaire de création) — ACTIVE ou INACTIVE
     *  uniquement ; jamais ARCHIVED à la création (voir `archive()`, qui exige un archivage
     *  explicite après coup, jamais dès la création). */
    status?: typeof ClientAccountStatus.Active | typeof ClientAccountStatus.Inactive | undefined;
    createdBy: string;
    occurredAt: Date;
  }): ClientAccount {
    return new ClientAccount({
      id: input.id,
      organizationId: input.organizationId,
      name: input.name,
      nameNormalized: normalizeClientAccountName(input.name),
      legalName: input.legalName,
      reference: input.reference,
      sector: input.sector,
      country: input.country,
      address: input.address,
      website: input.website,
      notes: input.notes,
      status: input.status ?? ClientAccountStatus.Active,
      createdBy: input.createdBy,
      updatedBy: undefined,
      archivedAt: undefined,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: ClientAccountProps): ClientAccount {
    return new ClientAccount(props);
  }

  private assertNotArchived(): void {
    if (this.props.status === ClientAccountStatus.Archived) {
      throw new ClientAccountArchivedError();
    }
  }

  private transitionTo(next: ClientAccountStatus, occurredAt: Date): void {
    const allowed = ALLOWED_CLIENT_ACCOUNT_TRANSITIONS[this.props.status];
    if (!allowed.includes(next)) {
      throw new InvalidClientAccountStatusTransitionError({ from: this.props.status, to: next });
    }
    this.props.status = next;
    this.props.updatedAt = occurredAt;
  }

  updateDetails(update: ClientAccountDetailsUpdate, updatedBy: string, occurredAt: Date): void {
    this.assertNotArchived();

    if (update.name !== undefined) {
      this.props.name = update.name;
      this.props.nameNormalized = normalizeClientAccountName(update.name);
    }
    if (update.legalName !== undefined) this.props.legalName = update.legalName;
    if (update.reference !== undefined) this.props.reference = update.reference;
    if (update.sector !== undefined) this.props.sector = update.sector;
    if (update.country !== undefined) this.props.country = update.country;
    if (update.address !== undefined) this.props.address = update.address;
    if (update.website !== undefined) this.props.website = update.website;
    if (update.notes !== undefined) this.props.notes = update.notes;

    this.props.updatedBy = updatedBy;
    this.props.updatedAt = occurredAt;
  }

  /** Bascule ACTIVE ↔ INACTIVE (mission §"Statuts possibles") — jamais vers/depuis ARCHIVED, qui
   *  reste réservé à `archive()`/`restore()` (transition + horodatage + idempotence dédiés). */
  setActiveOrInactive(next: typeof ClientAccountStatus.Active | typeof ClientAccountStatus.Inactive, updatedBy: string, occurredAt: Date): void {
    this.assertNotArchived();
    if (next !== this.props.status) {
      this.transitionTo(next, occurredAt);
    }
    this.props.updatedBy = updatedBy;
    this.props.updatedAt = occurredAt;
  }

  /** Idempotent (mission §"archivage idempotent") — archiver un client déjà archivé est un no-op
   *  silencieux, jamais une erreur. */
  archive(occurredAt: Date): void {
    if (this.props.status === ClientAccountStatus.Archived) {
      return;
    }
    this.transitionTo(ClientAccountStatus.Archived, occurredAt);
    this.props.archivedAt = occurredAt;
  }

  /** Idempotent (mission §"restauration idempotente") — restaurer un client déjà actif est un
   *  no-op silencieux. Ramène toujours à ACTIVE (jamais une reconstruction d'un statut INACTIVE
   *  antérieur — même motif documenté que Knowledge Base). */
  restore(occurredAt: Date): void {
    if (this.props.status !== ClientAccountStatus.Archived) {
      return;
    }
    this.transitionTo(ClientAccountStatus.Active, occurredAt);
    this.props.archivedAt = undefined;
  }

  /** Mission §"client archivé non sélectionnable pour un nouvel appel d'offres". */
  assertSelectableForNewTender(): void {
    if (this.props.status === ClientAccountStatus.Archived) {
      throw new ClientAccountArchivedError();
    }
  }

  /** Mission §"suppression définitive contrôlée" — un archivage préalable est obligatoire, même
   *  garde-fou que `KnowledgeEntry`/`DeleteKnowledgeEntryUseCase` (Sprint 5). */
  assertDeletable(): void {
    if (this.props.status !== ClientAccountStatus.Archived) {
      throw new ClientAccountNotArchivedError();
    }
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get name(): string {
    return this.props.name;
  }
  get nameNormalized(): string {
    return this.props.nameNormalized;
  }
  get legalName(): string | undefined {
    return this.props.legalName;
  }
  get reference(): string | undefined {
    return this.props.reference;
  }
  get sector(): string | undefined {
    return this.props.sector;
  }
  get country(): string | undefined {
    return this.props.country;
  }
  get address(): string | undefined {
    return this.props.address;
  }
  get website(): string | undefined {
    return this.props.website;
  }
  get notes(): string | undefined {
    return this.props.notes;
  }
  get status(): ClientAccountStatus {
    return this.props.status;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get updatedBy(): string | undefined {
    return this.props.updatedBy;
  }
  get archivedAt(): Date | undefined {
    return this.props.archivedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
