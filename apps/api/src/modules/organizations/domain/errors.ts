import { DomainError } from "../../../shared-kernel/domain-error";

export class InvalidOrganizationSlugError extends DomainError {
  readonly code = "INVALID_ORGANIZATION_SLUG";

  constructor(value: string) {
    super(
      `"${value}" is not a valid organization slug (lowercase letters, digits and single hyphens, 1-120 characters).`,
    );
  }
}

export class OrganizationSlugAlreadyTakenError extends DomainError {
  readonly code = "ORGANIZATION_SLUG_ALREADY_TAKEN";

  constructor() {
    super("An organization already exists with this slug.");
  }
}

export class OrganizationNotFoundError extends DomainError {
  readonly code = "ORGANIZATION_NOT_FOUND";

  constructor() {
    super("Organization not found.");
  }
}

export class InvalidOrganizationStatusTransitionError extends DomainError {
  readonly code = "INVALID_ORGANIZATION_STATUS_TRANSITION";

  constructor(input: { from: string; to: string }) {
    super(`Cannot transition organization from ${input.from} to ${input.to}.`);
  }
}
