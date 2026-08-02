import type { PersistableValidationReadinessStatus } from "./readiness-status";
import { ReadinessStatus } from "./readiness-status";
import type { ValidationIssue } from "./validation-issue";

export type ValidationRunProps = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  exportJobId: string;
  readinessStatus: PersistableValidationReadinessStatus;
  runBy: string;
  runAt: Date;
  issues: readonly ValidationIssue[];
};

/** Calcule le readiness à partir des issues d'UN run (mission §27/§30) — aucun contrôle bloquant
 *  ouvert et aucun avertissement ouvert ⇒ READY_FOR_APPROVAL ; aucun bloquant mais des
 *  avertissements ouverts ⇒ READY_WITH_WARNINGS ; au moins un bloquant ouvert ⇒ BLOCKED. */
export function computeRunReadiness(issues: readonly ValidationIssue[]): PersistableValidationReadinessStatus {
  const openBlocking = issues.some((issue) => issue.isBlocking && issue.isOpen);
  if (openBlocking) return ReadinessStatus.Blocked;
  const openWarning = issues.some((issue) => !issue.isBlocking && issue.isOpen);
  if (openWarning) return ReadinessStatus.ReadyWithWarnings;
  return ReadinessStatus.ReadyForApproval;
}

/**
 * Mission Sprint 8A §8/§26/§27 — une exécution de validation, immuable après création (mission
 * "une validation historique reste immuable") : seules les `ValidationIssue` qu'elle référence
 * peuvent être résolues/rouvertes ensuite, jamais le run lui-même ni son `readinessStatus` figé.
 */
export class ValidationRun {
  private constructor(private readonly props: ValidationRunProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    clientAccountId: string;
    tenderId: string;
    exportJobId: string;
    runBy: string;
    occurredAt: Date;
    issues: readonly ValidationIssue[];
  }): ValidationRun {
    return new ValidationRun({
      id: input.id,
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      tenderId: input.tenderId,
      exportJobId: input.exportJobId,
      readinessStatus: computeRunReadiness(input.issues),
      runBy: input.runBy,
      runAt: input.occurredAt,
      issues: input.issues,
    });
  }

  static rehydrate(props: ValidationRunProps): ValidationRun {
    return new ValidationRun(props);
  }

  /** Recalcule le readiness EN LECTURE, à partir de l'état ACTUEL des issues (potentiellement
   *  résolues depuis la création du run) — jamais persisté en retour sur ce run historique
   *  (mission "une validation historique reste immuable" : seul un NOUVEAU run peut figer un
   *  nouveau `readinessStatus`). Utilisé uniquement pour l'approbation. */
  currentReadiness(issues: readonly ValidationIssue[]): PersistableValidationReadinessStatus {
    return computeRunReadiness(issues);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get clientAccountId(): string {
    return this.props.clientAccountId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get exportJobId(): string {
    return this.props.exportJobId;
  }
  get readinessStatus(): PersistableValidationReadinessStatus {
    return this.props.readinessStatus;
  }
  get runBy(): string {
    return this.props.runBy;
  }
  get runAt(): Date {
    return this.props.runAt;
  }
  get issues(): readonly ValidationIssue[] {
    return this.props.issues;
  }
}
