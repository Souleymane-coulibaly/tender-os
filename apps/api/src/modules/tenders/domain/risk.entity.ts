export const RiskSeverity = { Low: "LOW", Medium: "MEDIUM", High: "HIGH", Critical: "CRITICAL" } as const;
export type RiskSeverity = (typeof RiskSeverity)[keyof typeof RiskSeverity];

export const RiskStatus = {
  Open: "OPEN",
  Mitigated: "MITIGATED",
  Resolved: "RESOLVED",
  Accepted: "ACCEPTED",
} as const;
export type RiskStatus = (typeof RiskStatus)[keyof typeof RiskStatus];

export type RiskProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  title: string;
  description?: string | undefined;
  severity: RiskSeverity;
  source?: string | undefined;
  status: RiskStatus;
  mitigation?: string | undefined;
  assignedTo?: string | undefined;
  resolvedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

export type RiskUpdate = {
  title?: string | undefined;
  description?: string | undefined;
  severity?: RiskSeverity | undefined;
  source?: string | undefined;
  mitigation?: string | undefined;
  assignedTo?: string | undefined;
};

export class Risk {
  private constructor(private props: RiskProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    title: string;
    description?: string | undefined;
    severity: RiskSeverity;
    source?: string | undefined;
    assignedTo?: string | undefined;
    occurredAt: Date;
  }): Risk {
    return new Risk({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      title: input.title,
      description: input.description,
      severity: input.severity,
      source: input.source,
      status: RiskStatus.Open,
      mitigation: undefined,
      assignedTo: input.assignedTo,
      resolvedAt: undefined,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: RiskProps): Risk {
    return new Risk(props);
  }

  update(update: RiskUpdate, occurredAt: Date): void {
    if (update.title !== undefined) this.props.title = update.title;
    if (update.description !== undefined) this.props.description = update.description;
    if (update.severity !== undefined) this.props.severity = update.severity;
    if (update.source !== undefined) this.props.source = update.source;
    if (update.mitigation !== undefined) this.props.mitigation = update.mitigation;
    if (update.assignedTo !== undefined) this.props.assignedTo = update.assignedTo;
    this.props.updatedAt = occurredAt;
  }

  changeStatus(status: RiskStatus, occurredAt: Date): void {
    this.props.status = status;
    this.props.resolvedAt =
      status === RiskStatus.Resolved || status === RiskStatus.Accepted ? occurredAt : undefined;
    this.props.updatedAt = occurredAt;
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
  get title(): string {
    return this.props.title;
  }
  get description(): string | undefined {
    return this.props.description;
  }
  get severity(): RiskSeverity {
    return this.props.severity;
  }
  get source(): string | undefined {
    return this.props.source;
  }
  get status(): RiskStatus {
    return this.props.status;
  }
  get mitigation(): string | undefined {
    return this.props.mitigation;
  }
  get assignedTo(): string | undefined {
    return this.props.assignedTo;
  }
  get resolvedAt(): Date | undefined {
    return this.props.resolvedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
