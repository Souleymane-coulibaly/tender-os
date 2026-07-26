export const AlertSeverity = { Critical: "CRITICAL", Warning: "WARNING", Info: "INFO" } as const;
export type AlertSeverity = (typeof AlertSeverity)[keyof typeof AlertSeverity];

export type AlertProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  type: string;
  severity: AlertSeverity;
  message: string;
  source?: string | undefined;
  resolved: boolean;
  resolvedAt?: Date | undefined;
  resolvedBy?: string | undefined;
  createdAt: Date;
};

/**
 * CRUD manuel (mission §12 — "prévoir une architecture extensible, sans IA") : aucune
 * génération automatique de règle métier n'est implémentée dans cette tranche.
 */
export class Alert {
  private constructor(private props: AlertProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    type: string;
    severity: AlertSeverity;
    message: string;
    source?: string | undefined;
    occurredAt: Date;
  }): Alert {
    return new Alert({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      type: input.type,
      severity: input.severity,
      message: input.message,
      source: input.source,
      resolved: false,
      resolvedAt: undefined,
      resolvedBy: undefined,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: AlertProps): Alert {
    return new Alert(props);
  }

  resolve(resolvedBy: string, occurredAt: Date): void {
    this.props.resolved = true;
    this.props.resolvedAt = occurredAt;
    this.props.resolvedBy = resolvedBy;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get type(): string {
    return this.props.type;
  }
  get severity(): AlertSeverity {
    return this.props.severity;
  }
  get message(): string {
    return this.props.message;
  }
  get source(): string | undefined {
    return this.props.source;
  }
  get resolved(): boolean {
    return this.props.resolved;
  }
  get resolvedAt(): Date | undefined {
    return this.props.resolvedAt;
  }
  get resolvedBy(): string | undefined {
    return this.props.resolvedBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
