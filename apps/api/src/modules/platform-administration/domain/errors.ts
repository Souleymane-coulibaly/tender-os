import { DomainError } from "../../../shared-kernel/domain-error";

export class PlatformAccessDeniedError extends DomainError {
  readonly code = "PLATFORM_ACCESS_DENIED";

  constructor() {
    super("This actor does not have platform administration access.");
  }
}

export class PlatformCapabilityMissingError extends DomainError {
  readonly code = "PLATFORM_CAPABILITY_MISSING";

  constructor(input: { capability: string }) {
    super(`Missing platform capability: ${input.capability}.`);
  }
}

export class PlatformAdministratorAlreadyExistsError extends DomainError {
  readonly code = "PLATFORM_ADMINISTRATOR_ALREADY_EXISTS";

  constructor() {
    super("This user is already a platform administrator.");
  }
}
