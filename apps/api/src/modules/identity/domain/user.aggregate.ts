import { EmailAddress } from "./email-address.value-object";
import { UserNotActiveError } from "./errors";
import { UserId } from "./user-id.value-object";
import { UserStatus } from "./user-status";

export type UserProps = {
  id: UserId;
  email: EmailAddress;
  displayName: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
  status: UserStatus;
  passwordHash: string;
  emailVerifiedAt?: Date | undefined;
  lastLoginAt?: Date | undefined;
  termsAcceptedAt?: Date | undefined;
  termsAcceptedVersion?: string | undefined;
  /** V2 Sprint 25 (Guide interactif) — mission §25.82 "User-scoped", jamais organization-scoped. */
  tourStartedAt?: Date | undefined;
  tourCompletedAt?: Date | undefined;
  tourDismissedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Identité humaine globale, indépendante de toute organisation
 * (bible/03-domain/domain-model.md, docs/04-architecture/DATABASE_DESIGN.md §5.1).
 *
 * Porte aussi le hash du mot de passe : dans cette tranche verticale, "Identity" et
 * "Authentication" sont implémentés comme un seul module (consigne de la mission) ;
 * `passwordHash` n'est jamais exposé hors de ce module (voir les Presenters).
 */
export class User {
  private constructor(private props: UserProps) {}

  static register(input: {
    id: UserId;
    email: EmailAddress;
    displayName: string;
    firstName?: string | undefined;
    lastName?: string | undefined;
    passwordHash: string;
    /** Toujours la constante `TERMS_VERSION` (jamais une valeur fournie par le client) — voir
     *  `RegisterUserUseCase`. */
    termsVersion: string;
    occurredAt: Date;
  }): User {
    return new User({
      id: input.id,
      email: input.email,
      displayName: input.displayName,
      firstName: input.firstName,
      lastName: input.lastName,
      status: UserStatus.Active,
      passwordHash: input.passwordHash,
      emailVerifiedAt: undefined,
      lastLoginAt: undefined,
      termsAcceptedAt: input.occurredAt,
      termsAcceptedVersion: input.termsVersion,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: UserProps): User {
    return new User(props);
  }

  /**
   * Refuse l'authentification d'un compte qui n'est pas ACTIVE
   * (statuts INVITED/SUSPENDED/DEACTIVATED — docs/04-architecture/DATABASE_DESIGN.md §5.1).
   */
  assertCanAuthenticate(): void {
    if (this.props.status !== UserStatus.Active) {
      throw new UserNotActiveError({ status: this.props.status });
    }
  }

  recordLogin(occurredAt: Date): void {
    this.assertCanAuthenticate();
    this.props.lastLoginAt = occurredAt;
    this.props.updatedAt = occurredAt;
  }

  /** V2 Sprint 24 (onboarding) — flow "Mot de passe oublié" : remplace le hash, jamais le mot de
   *  passe en clair. Le jeton ayant déjà été validé par `ResetPasswordUseCase`, aucune
   *  vérification de statut ici (un compte SUSPENDED reste réinitialisable — seule
   *  `assertCanAuthenticate` bloque la connexion elle-même). */
  resetPassword(newPasswordHash: string, occurredAt: Date): void {
    this.props.passwordHash = newPasswordHash;
    this.props.updatedAt = occurredAt;
  }

  /** V2 Sprint 25 (Guide interactif) — mission §25.72 "Bienvenue... Commencer la visite". Efface
   *  un `tourDismissedAt` antérieur (mission §25.83 "Relancer la visite guidée" doit repartir d'un
   *  état propre, jamais un dismiss qui reste figé après une relance explicite). Ne touche jamais
   *  `tourCompletedAt` — redémarrer une visite déjà terminée n'efface pas l'historique de
   *  complétion (utile si l'on veut un jour distinguer "jamais fait" de "refait").
   */
  startTour(occurredAt: Date): void {
    this.props.tourStartedAt = occurredAt;
    this.props.tourDismissedAt = undefined;
    this.props.updatedAt = occurredAt;
  }

  /** mission §25.73 — la visite est allée jusqu'à la dernière étape. */
  completeTour(occurredAt: Date): void {
    this.props.tourCompletedAt = occurredAt;
    this.props.updatedAt = occurredAt;
  }

  /** mission §25.72 "Plus tard" / §25.88 "Passer"/"Fermer" — ne force jamais une reprise
   *  ultérieure, mais mémorise que l'utilisateur a déjà été sollicité une fois (jamais republié
   *  automatiquement, seulement via "Relancer la visite guidée", mission §25.83). */
  dismissTour(occurredAt: Date): void {
    this.props.tourDismissedAt = occurredAt;
    this.props.updatedAt = occurredAt;
  }

  get id(): UserId {
    return this.props.id;
  }

  get email(): EmailAddress {
    return this.props.email;
  }

  get displayName(): string {
    return this.props.displayName;
  }

  get firstName(): string | undefined {
    return this.props.firstName;
  }

  get lastName(): string | undefined {
    return this.props.lastName;
  }

  get status(): UserStatus {
    return this.props.status;
  }

  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get emailVerifiedAt(): Date | undefined {
    return this.props.emailVerifiedAt;
  }

  get lastLoginAt(): Date | undefined {
    return this.props.lastLoginAt;
  }

  get termsAcceptedAt(): Date | undefined {
    return this.props.termsAcceptedAt;
  }

  get termsAcceptedVersion(): string | undefined {
    return this.props.termsAcceptedVersion;
  }

  get tourStartedAt(): Date | undefined {
    return this.props.tourStartedAt;
  }

  get tourCompletedAt(): Date | undefined {
    return this.props.tourCompletedAt;
  }

  get tourDismissedAt(): Date | undefined {
    return this.props.tourDismissedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
