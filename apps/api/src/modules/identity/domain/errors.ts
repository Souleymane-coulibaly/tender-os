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

export class UserNotActiveError extends DomainError {
  readonly code = "USER_NOT_ACTIVE";

  constructor(input: { status: string }) {
    super(`User account is not active (status: ${input.status}).`);
  }
}

export class SessionNotFoundError extends DomainError {
  readonly code = "SESSION_NOT_FOUND";

  constructor() {
    super("Session not found or already revoked.");
  }
}
