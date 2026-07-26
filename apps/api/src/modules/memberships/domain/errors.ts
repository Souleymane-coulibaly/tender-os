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
