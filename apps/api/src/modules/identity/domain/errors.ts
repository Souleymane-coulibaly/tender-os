import { DomainError } from "../../../shared-kernel/domain-error";

export class InvalidEmailAddressError extends DomainError {
  readonly code = "INVALID_EMAIL_ADDRESS";

  constructor(value: string) {
    super(`"${value}" is not a valid email address.`);
  }
}

export class EmailAlreadyRegisteredError extends DomainError {
  readonly code = "EMAIL_ALREADY_REGISTERED";

  constructor() {
    super("An account already exists for this email address.");
  }
}

export class UserNotFoundError extends DomainError {
  readonly code = "USER_NOT_FOUND";

  constructor() {
    super("User not found.");
  }
}

export class InvalidCredentialsError extends DomainError {
  readonly code = "INVALID_CREDENTIALS";

  constructor() {
    super("Email or password is incorrect.");
  }
}

/** Sprint 21 (hardening) — mission §24 anti-énumération : le message ne reflète jamais le statut
 *  exact (SUSPENDED/DEACTIVATED/INVITED...) dans la réponse HTTP — un attaquant qui possède déjà un
 *  mot de passe valide pour ce compte (credential déjà compromis par ailleurs) n'apprend rien de
 *  plus que "ce compte est inactif", jamais la nuance exacte de statut. `status` reste disponible
 *  sur l'instance pour un usage diagnostic serveur (jamais renvoyé au client). */
export class UserNotActiveError extends DomainError {
  readonly code = "USER_NOT_ACTIVE";
  readonly status: string;

  constructor(input: { status: string }) {
    super("This account is not active. Contact your organization administrator.");
    this.status = input.status;
  }
}

export class SessionNotFoundError extends DomainError {
  readonly code = "SESSION_NOT_FOUND";

  constructor() {
    super("Session not found or already revoked.");
  }
}

/** V2 Sprint 24 (onboarding, CGU) — défense en profondeur : `RegisterBodySchema` refuse déjà
 *  `termsAccepted !== true` à la frontière HTTP, ce garde-fou domain refuse en plus toute
 *  tentative d'appeler le use case directement sans acceptation (jamais une seule couche de
 *  contrôle pour un invariant légal/RGPD). */
export class TermsNotAcceptedError extends DomainError {
  readonly code = "TERMS_NOT_ACCEPTED";

  constructor() {
    super("Vous devez accepter les Conditions Générales d'Utilisation pour continuer.");
  }
}

/** V2 Sprint 24 (onboarding) — anti-énumération : un jeton absent, expiré, ou déjà consommé
 *  renvoie TOUJOURS ce même message générique, jamais une nuance qui distinguerait ces cas. */
export class PasswordResetTokenInvalidError extends DomainError {
  readonly code = "PASSWORD_RESET_TOKEN_INVALID";

  constructor() {
    super("This password reset link is invalid or has expired.");
  }
}
