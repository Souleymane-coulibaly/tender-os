import { DomainError } from "../../../shared-kernel/domain-error";

export class ClientAccountNotFoundError extends DomainError {
  readonly code = "CLIENT_ACCOUNT_NOT_FOUND";
  constructor() {
    super("Client account not found or not accessible.");
  }
}

export class DuplicateClientAccountNameError extends DomainError {
  readonly code = "DUPLICATE_CLIENT_ACCOUNT_NAME";
  constructor() {
    super("A client account with this name already exists in this organization.");
  }
}

export class InvalidClientAccountStatusError extends DomainError {
  readonly code = "INVALID_CLIENT_ACCOUNT_STATUS";
  constructor(value: string) {
    super(`Invalid client account status: "${value}".`);
  }
}

export class InvalidClientAccountStatusTransitionError extends DomainError {
  readonly code = "INVALID_CLIENT_ACCOUNT_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition client account from ${input.from} to ${input.to}.`);
  }
}

export class ClientAccountArchivedError extends DomainError {
  readonly code = "CLIENT_ACCOUNT_ARCHIVED";
  constructor() {
    super("This client account is archived and cannot be selected or mutated.");
  }
}

export class ClientAccountNotArchivedError extends DomainError {
  readonly code = "CLIENT_ACCOUNT_NOT_ARCHIVED";
  constructor() {
    super("A client account must be archived before it can be permanently deleted.");
  }
}

export class ClientAccountHasDependenciesError extends DomainError {
  readonly code = "CLIENT_ACCOUNT_HAS_DEPENDENCIES";
  constructor() {
    super("This client account still has tenders or knowledge entries and cannot be deleted.");
  }
}

export class InvalidClientRoleError extends DomainError {
  readonly code = "INVALID_CLIENT_ROLE";
  constructor(value: string) {
    super(`Invalid client role: "${value}".`);
  }
}

export class ClientAssignmentNotFoundError extends DomainError {
  readonly code = "CLIENT_ASSIGNMENT_NOT_FOUND";
  constructor() {
    super("Client assignment not found.");
  }
}

export class DuplicateClientAssignmentError extends DomainError {
  readonly code = "DUPLICATE_CLIENT_ASSIGNMENT";
  constructor() {
    super("This user is already assigned to this client.");
  }
}

export class CrossOrganizationUserError extends DomainError {
  readonly code = "CROSS_ORGANIZATION_USER";
  constructor() {
    super("This user does not belong to this organization.");
  }
}

export class ClientPermissionMissingError extends DomainError {
  readonly code = "CLIENT_PERMISSION_MISSING";
  constructor(input: { permission: string }) {
    super(`Missing permission: ${input.permission}.`);
  }
}

/** Mission Sprint 5.1 §"validation stricte de cohérence" — jamais une entrée Knowledge dont le
 *  `clientAccountId` prétend appartenir à un client d'une autre organisation, jamais une bascule
 *  global/client après création. */
export class InvalidClientKnowledgeScopeError extends DomainError {
  readonly code = "INVALID_CLIENT_KNOWLEDGE_SCOPE";
  constructor(message: string) {
    super(message);
  }
}
