import { InvalidResolutionTransitionError } from "./errors";
import { ValidationSeverity } from "./validation-severity";

export const ValidationResolutionStatus = {
  Open: "OPEN",
  Resolved: "RESOLVED",
  Reopened: "REOPENED",
} as const;
export type ValidationResolutionStatus = (typeof ValidationResolutionStatus)[keyof typeof ValidationResolutionStatus];

const ALLOWED_RESOLUTION_TRANSITIONS: Record<ValidationResolutionStatus, readonly ValidationResolutionStatus[]> = {
  [ValidationResolutionStatus.Open]: [ValidationResolutionStatus.Resolved],
  [ValidationResolutionStatus.Resolved]: [ValidationResolutionStatus.Reopened],
  [ValidationResolutionStatus.Reopened]: [ValidationResolutionStatus.Resolved],
};

export type ValidationIssueProps = {
  id: string;
  organizationId: string;
  validationRunId: string;
  ruleCode: string;
  severity: ValidationSeverity;
  message: string;
  resourceType?: string | undefined;
  resourceId?: string | undefined;
  source?: string | undefined;
  recommendation?: string | undefined;
  detectedAt: Date;
  resolutionStatus: ValidationResolutionStatus;
  resolvedAt?: Date | undefined;
  resolvedBy?: string | undefined;
  resolutionNote?: string | undefined;
};

/**
 * Mission Sprint 8A §26/§29 — un contrôle détecté par le moteur de validation. `blocking` est
 * DÉRIVÉ de `severity` uniquement (jamais un second booléen redondant qui pourrait diverger).
 * Une résolution/réouverture conserve TOUJOURS l'auteur, la date et une justification.
 */
export class ValidationIssue {
  private constructor(private props: ValidationIssueProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    validationRunId: string;
    ruleCode: string;
    severity: ValidationSeverity;
    message: string;
    resourceType?: string | undefined;
    resourceId?: string | undefined;
    source?: string | undefined;
    recommendation?: string | undefined;
    occurredAt: Date;
  }): ValidationIssue {
    return new ValidationIssue({
      id: input.id,
      organizationId: input.organizationId,
      validationRunId: input.validationRunId,
      ruleCode: input.ruleCode,
      severity: input.severity,
      message: input.message,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      source: input.source,
      recommendation: input.recommendation,
      detectedAt: input.occurredAt,
      resolutionStatus: ValidationResolutionStatus.Open,
    });
  }

  static rehydrate(props: ValidationIssueProps): ValidationIssue {
    return new ValidationIssue(props);
  }

  private transitionTo(next: ValidationResolutionStatus, input: { resolvedBy: string; resolutionNote: string; occurredAt: Date }): void {
    if (!ALLOWED_RESOLUTION_TRANSITIONS[this.props.resolutionStatus].includes(next)) {
      throw new InvalidResolutionTransitionError({ from: this.props.resolutionStatus, to: next });
    }
    if (!input.resolutionNote.trim()) {
      throw new Error("a resolution note is required");
    }
    this.props.resolutionStatus = next;
    this.props.resolvedAt = input.occurredAt;
    this.props.resolvedBy = input.resolvedBy;
    this.props.resolutionNote = input.resolutionNote;
  }

  resolve(input: { resolvedBy: string; resolutionNote: string; occurredAt: Date }): void {
    this.transitionTo(ValidationResolutionStatus.Resolved, input);
  }

  reopen(input: { resolvedBy: string; resolutionNote: string; occurredAt: Date }): void {
    this.transitionTo(ValidationResolutionStatus.Reopened, input);
  }

  get isBlocking(): boolean {
    return this.props.severity === ValidationSeverity.Blocking;
  }

  get isOpen(): boolean {
    return this.props.resolutionStatus === ValidationResolutionStatus.Open || this.props.resolutionStatus === ValidationResolutionStatus.Reopened;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get validationRunId(): string {
    return this.props.validationRunId;
  }
  get ruleCode(): string {
    return this.props.ruleCode;
  }
  get severity(): ValidationSeverity {
    return this.props.severity;
  }
  get message(): string {
    return this.props.message;
  }
  get resourceType(): string | undefined {
    return this.props.resourceType;
  }
  get resourceId(): string | undefined {
    return this.props.resourceId;
  }
  get source(): string | undefined {
    return this.props.source;
  }
  get recommendation(): string | undefined {
    return this.props.recommendation;
  }
  get detectedAt(): Date {
    return this.props.detectedAt;
  }
  get resolutionStatus(): ValidationResolutionStatus {
    return this.props.resolutionStatus;
  }
  get resolvedAt(): Date | undefined {
    return this.props.resolvedAt;
  }
  get resolvedBy(): string | undefined {
    return this.props.resolvedBy;
  }
  get resolutionNote(): string | undefined {
    return this.props.resolutionNote;
  }
}
