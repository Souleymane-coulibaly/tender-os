import { InvalidOrganizationStatusTransitionError } from "./errors";
import { OrganizationId } from "./organization-id.value-object";
import { OrganizationSlug } from "./organization-slug.value-object";
import { OrganizationStatus } from "./organization-status";

export type OrganizationSettings = Record<string, unknown>;

export type OrganizationProps = {
  id: OrganizationId;
  name: string;
  slug: OrganizationSlug;
  legalName?: string | undefined;
  registrationNumber?: string | undefined;
  countryCode?: string | undefined;
  defaultCurrency: string;
  defaultTimezone: string;
  status: OrganizationStatus;
  settings: OrganizationSettings;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | undefined;
};

export type OrganizationProfileUpdate = {
  name?: string | undefined;
  legalName?: string | undefined;
  registrationNumber?: string | undefined;
  countryCode?: string | undefined;
  defaultCurrency?: string | undefined;
  defaultTimezone?: string | undefined;
  settings?: OrganizationSettings | undefined;
};

/**
 * Entreprise cliente de TenderOS, agrégat racine du tenant — frontière principale
 * d'isolation des données (bible/02-product/ubiquitous-language.md,
 * bible/03-domain/business-rules.md BR-ORG-001).
 *
 * Le `slug` est la clé métier lisible et n'est volontairement pas modifiable par
 * `updateProfile` dans cette tranche (aucune règle de changement de slug n'est documentée).
 */
export class Organization {
  private constructor(private props: OrganizationProps) {}

  static create(input: {
    id: OrganizationId;
    name: string;
    slug: OrganizationSlug;
    legalName?: string | undefined;
    registrationNumber?: string | undefined;
    countryCode?: string | undefined;
    defaultCurrency: string;
    defaultTimezone: string;
    settings?: OrganizationSettings | undefined;
    occurredAt: Date;
  }): Organization {
    return new Organization({
      id: input.id,
      name: input.name,
      slug: input.slug,
      legalName: input.legalName,
      registrationNumber: input.registrationNumber,
      countryCode: input.countryCode,
      defaultCurrency: input.defaultCurrency,
      defaultTimezone: input.defaultTimezone,
      status: OrganizationStatus.Trial,
      settings: input.settings ?? {},
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      deletedAt: undefined,
    });
  }

  static rehydrate(props: OrganizationProps): Organization {
    return new Organization(props);
  }

  updateProfile(update: OrganizationProfileUpdate, occurredAt: Date): void {
    if (update.name !== undefined) {
      this.props.name = update.name;
    }
    if (update.legalName !== undefined) {
      this.props.legalName = update.legalName;
    }
    if (update.registrationNumber !== undefined) {
      this.props.registrationNumber = update.registrationNumber;
    }
    if (update.countryCode !== undefined) {
      this.props.countryCode = update.countryCode;
    }
    if (update.defaultCurrency !== undefined) {
      this.props.defaultCurrency = update.defaultCurrency;
    }
    if (update.defaultTimezone !== undefined) {
      this.props.defaultTimezone = update.defaultTimezone;
    }
    if (update.settings !== undefined) {
      this.props.settings = update.settings;
    }
    this.props.updatedAt = occurredAt;
  }

  /**
   * Suppression logique (bible/03-domain/business-rules.md BR-GEN-003) — la ligne
   * reste en base, `deletedAt` la marque comme supprimée pour les lectures normales.
   */
  markDeleted(occurredAt: Date): void {
    this.props.deletedAt = occurredAt;
    this.props.updatedAt = occurredAt;
  }

  /**
   * Suspension administrative plateforme — aucune transition de statut n'étant documentée
   * pour Organization, seule la transition la plus littérale est appliquée : réversible,
   * jamais depuis CLOSED ou déjà SUSPENDED (skills/platform-foundation/... aucune matrice
   * de transition n'existe encore, décision minimale à valider si un besoin plus riche émerge).
   */
  suspend(occurredAt: Date): void {
    if (this.props.status === OrganizationStatus.Suspended || this.props.status === OrganizationStatus.Closed) {
      throw new InvalidOrganizationStatusTransitionError({
        from: this.props.status,
        to: OrganizationStatus.Suspended,
      });
    }
    this.props.status = OrganizationStatus.Suspended;
    this.props.updatedAt = occurredAt;
  }

  reactivate(occurredAt: Date): void {
    if (this.props.status !== OrganizationStatus.Suspended) {
      throw new InvalidOrganizationStatusTransitionError({
        from: this.props.status,
        to: OrganizationStatus.Active,
      });
    }
    this.props.status = OrganizationStatus.Active;
    this.props.updatedAt = occurredAt;
  }

  get id(): OrganizationId {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get slug(): OrganizationSlug {
    return this.props.slug;
  }

  get legalName(): string | undefined {
    return this.props.legalName;
  }

  get registrationNumber(): string | undefined {
    return this.props.registrationNumber;
  }

  get countryCode(): string | undefined {
    return this.props.countryCode;
  }

  get defaultCurrency(): string {
    return this.props.defaultCurrency;
  }

  get defaultTimezone(): string {
    return this.props.defaultTimezone;
  }

  get status(): OrganizationStatus {
    return this.props.status;
  }

  get settings(): OrganizationSettings {
    return this.props.settings;
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
