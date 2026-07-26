export const MilestoneType = {
  SubmissionDeadline: "SUBMISSION_DEADLINE",
  QuestionDeadline: "QUESTION_DEADLINE",
  MandatoryVisit: "MANDATORY_VISIT",
  InternalValidation: "INTERNAL_VALIDATION",
  Custom: "CUSTOM",
} as const;
export type MilestoneType = (typeof MilestoneType)[keyof typeof MilestoneType];

export const MilestoneStatus = { Pending: "PENDING", Done: "DONE" } as const;
export type MilestoneStatus = (typeof MilestoneStatus)[keyof typeof MilestoneStatus];

export type MilestoneProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  title: string;
  description?: string | undefined;
  date: Date;
  type: MilestoneType;
  status: MilestoneStatus;
  responsibleUserId?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
};

export type MilestoneUpdate = {
  title?: string | undefined;
  description?: string | undefined;
  date?: Date | undefined;
  type?: MilestoneType | undefined;
  responsibleUserId?: string | undefined;
};

/** Le dépassement ("overdue") est calculé à la lecture, jamais stocké — voir `isOverdue`. */
export class Milestone {
  private constructor(private props: MilestoneProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    title: string;
    description?: string | undefined;
    date: Date;
    type: MilestoneType;
    responsibleUserId?: string | undefined;
    occurredAt: Date;
  }): Milestone {
    return new Milestone({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      title: input.title,
      description: input.description,
      date: input.date,
      type: input.type,
      status: MilestoneStatus.Pending,
      responsibleUserId: input.responsibleUserId,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: MilestoneProps): Milestone {
    return new Milestone(props);
  }

  update(update: MilestoneUpdate, occurredAt: Date): void {
    if (update.title !== undefined) this.props.title = update.title;
    if (update.description !== undefined) this.props.description = update.description;
    if (update.date !== undefined) this.props.date = update.date;
    if (update.type !== undefined) this.props.type = update.type;
    if (update.responsibleUserId !== undefined) this.props.responsibleUserId = update.responsibleUserId;
    this.props.updatedAt = occurredAt;
  }

  markDone(occurredAt: Date): void {
    this.props.status = MilestoneStatus.Done;
    this.props.updatedAt = occurredAt;
  }

  isOverdue(at: Date): boolean {
    return this.props.status === MilestoneStatus.Pending && this.props.date.getTime() < at.getTime();
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
  get date(): Date {
    return this.props.date;
  }
  get type(): MilestoneType {
    return this.props.type;
  }
  get status(): MilestoneStatus {
    return this.props.status;
  }
  get responsibleUserId(): string | undefined {
    return this.props.responsibleUserId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
