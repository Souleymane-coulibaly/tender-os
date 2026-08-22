import { DomainError } from "../../../shared-kernel/domain-error";

export class AiRoutingPermissionMissingError extends DomainError {
  readonly code = "AI_ROUTING_PERMISSION_MISSING";
  constructor() {
    super("Actor does not have the required AI routing permission.");
  }
}

export class UnknownAiTaskTypeError extends DomainError {
  readonly code = "UNKNOWN_AI_TASK_TYPE";
  constructor(value: string) {
    super(`"${value}" is not a recognized AI task type.`);
  }
}

/** Mission §12/§36 — jamais une dégradation silencieuse : un override incompatible avec la tâche
 *  est refusé explicitement à l'écriture, jamais stocké puis ignoré plus tard sans que
 *  l'utilisateur en soit informé. */
export class IncompatibleModelOverrideError extends DomainError {
  readonly code = "INCOMPATIBLE_MODEL_OVERRIDE";
  constructor(
    readonly taskType: string,
    readonly model: string,
  ) {
    super(`"${model}" is not an allowed model override for task type "${taskType}".`);
  }
}
