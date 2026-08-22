import { DomainError } from "../../../shared-kernel/domain-error";

export class InvalidOrganizationRoleError extends DomainError {
  readonly code = "INVALID_ORGANIZATION_ROLE";

  constructor(value: string) {
    super(`"${value}" is not a valid organization role.`);
  }
}

export class MembershipAlreadyExistsError extends DomainError {
  readonly code = "MEMBERSHIP_ALREADY_EXISTS";

  constructor() {
    super("A membership already exists for this user in this organization.");
  }
}

export class MembershipNotFoundError extends DomainError {
  readonly code = "MEMBERSHIP_NOT_FOUND";

  constructor() {
    super("Membership not found.");
  }
}

export class MembershipNotActiveError extends DomainError {
  readonly code = "MEMBERSHIP_NOT_ACTIVE";

  constructor(input: { status: string }) {
    super(`Membership is not active (status: ${input.status}).`);
  }
}

/**
 * BR-ORG-002 — chaque organisation doit toujours conserver au moins un Organization Admin actif.
 */
export class LastOrganizationAdminError extends DomainError {
  readonly code = "LAST_ORGANIZATION_ADMIN_REQUIRED";

  constructor() {
    super("The organization must keep at least one active Organization Admin.");
  }
}

/**
 * bible/03-domain/permissions.md §31 — code de refus canonique.
 */
export class PermissionMissingError extends DomainError {
  readonly code = "PERMISSION_MISSING";

  constructor(input: { permission: string }) {
    super(`Missing permission: ${input.permission}.`);
  }
}

/**
 * BR-ORG-002 — chaque organisation doit toujours conserver un OWNER actif. Distinct de
 * `LastOrganizationAdminError` : porte spécifiquement sur le rôle `OWNER`, jamais sur
 * `ORGANIZATION_ADMIN`.
 */
export class LastOrganizationOwnerError extends DomainError {
  readonly code = "LAST_ORGANIZATION_OWNER_REQUIRED";

  constructor() {
    super("The organization must always keep exactly one active OWNER.");
  }
}

/**
 * BR-ORG-002/BR-ORG-004 — le rôle OWNER ne peut jamais être attribué ni retiré par un
 * changement de rôle ordinaire (`organization:role:assign`), dans un sens comme dans l'autre :
 * seul TransferOrganizationOwnershipUseCase peut faire porter ou quitter ce rôle.
 */
export class OwnershipRequiresTransferError extends DomainError {
  readonly code = "OWNERSHIP_REQUIRES_TRANSFER";

  constructor() {
    super("The OWNER role can only be assigned or removed via the ownership transfer use case.");
  }
}

/**
 * BR-ORG-004 — seul l'OWNER actif courant peut initier un transfert de propriété.
 */
export class NotOrganizationOwnerError extends DomainError {
  readonly code = "NOT_ORGANIZATION_OWNER";

  constructor() {
    super("Only the current active OWNER can transfer ownership.");
  }
}

/**
 * BR-ORG-004 — transférer la propriété à soi-même n'a pas de sens métier.
 */
export class CannotTransferOwnershipToSelfError extends DomainError {
  readonly code = "CANNOT_TRANSFER_OWNERSHIP_TO_SELF";

  constructor() {
    super("Cannot transfer ownership to the current OWNER.");
  }
}

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1, mission §15 — "le backend doit refuser une invitation dépassant
 * la limite, pas seulement le frontend". `USERS_MAX` (billing) n'était vérifié qu'après coup, en
 * notification seule (`CheckQuotaThresholdUseCase`, jamais bloquant) — ce code ferme ce gap pour la
 * création elle-même, jamais un second moteur de quota (le nombre de membres actifs et la limite
 * viennent tous deux des autorités déjà existantes : `CountActiveMembersUseCase`/`EntitlementService`).
 */
export class SeatLimitExceededError extends DomainError {
  readonly code = "SEAT_LIMIT_EXCEEDED";

  constructor(input: { used: number; limit: number }) {
    super(`This organization has reached its plan's user seat limit (${input.used}/${input.limit}).`);
  }
}
