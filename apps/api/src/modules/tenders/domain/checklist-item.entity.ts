export const ChecklistItemStatus = {
  Todo: "TODO",
  InProgress: "IN_PROGRESS",
  Completed: "COMPLETED",
  NotApplicable: "NOT_APPLICABLE",
} as const;
export type ChecklistItemStatus = (typeof ChecklistItemStatus)[keyof typeof ChecklistItemStatus];

export type ChecklistItemProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  title: string;
  description?: string | undefined;
  required: boolean;
  status: ChecklistItemStatus;
  assignedTo?: string | undefined;
  dueDate?: Date | undefined;
  comment?: string | undefined;
  completedAt?: Date | undefined;
  completedBy?: string | undefined;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ChecklistItemUpdate = {
  title?: string | undefined;
  description?: string | undefined;
  required?: boolean | undefined;
  assignedTo?: string | undefined;
  dueDate?: Date | undefined;
  comment?: string | undefined;
  displayOrder?: number | undefined;
};

export class ChecklistItem {
  private constructor(private props: ChecklistItemProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    title: string;
    description?: string | undefined;
    required?: boolean | undefined;
    assignedTo?: string | undefined;
    dueDate?: Date | undefined;
    displayOrder?: number | undefined;
    occurredAt: Date;
  }): ChecklistItem {
    return new ChecklistItem({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      title: input.title,
      description: input.description,
      required: input.required ?? false,
      status: ChecklistItemStatus.Todo,
      assignedTo: input.assignedTo,
      dueDate: input.dueDate,
      comment: undefined,
      completedAt: undefined,
      completedBy: undefined,
      displayOrder: input.displayOrder ?? 0,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: ChecklistItemProps): ChecklistItem {
    return new ChecklistItem(props);
  }

  update(update: ChecklistItemUpdate, occurredAt: Date): void {
    if (update.title !== undefined) this.props.title = update.title;
    if (update.description !== undefined) this.props.description = update.description;
    if (update.required !== undefined) this.props.required = update.required;
    if (update.assignedTo !== undefined) this.props.assignedTo = update.assignedTo;
    if (update.dueDate !== undefined) this.props.dueDate = update.dueDate;
    if (update.comment !== undefined) this.props.comment = update.comment;
    if (update.displayOrder !== undefined) this.props.displayOrder = update.displayOrder;
    this.props.updatedAt = occurredAt;
  }

  changeStatus(status: ChecklistItemStatus, actorId: string | undefined, occurredAt: Date): void {
    this.props.status = status;
    if (status === ChecklistItemStatus.Completed) {
      this.props.completedAt = occurredAt;
      this.props.completedBy = actorId;
    } else {
      this.props.completedAt = undefined;
      this.props.completedBy = undefined;
    }
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
  get required(): boolean {
    return this.props.required;
  }
  get status(): ChecklistItemStatus {
    return this.props.status;
  }
  get assignedTo(): string | undefined {
    return this.props.assignedTo;
  }
  get dueDate(): Date | undefined {
    return this.props.dueDate;
  }
  get comment(): string | undefined {
    return this.props.comment;
  }
  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }
  get completedBy(): string | undefined {
    return this.props.completedBy;
  }
  get displayOrder(): number {
    return this.props.displayOrder;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
