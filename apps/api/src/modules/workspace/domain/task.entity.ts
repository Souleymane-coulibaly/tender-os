export const TaskStatus = {
  Todo: "TODO",
  InProgress: "IN_PROGRESS",
  Blocked: "BLOCKED",
  InReview: "IN_REVIEW",
  Done: "DONE",
  Cancelled: "CANCELLED",
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = [TaskStatus.Done, TaskStatus.Cancelled];

/** V2 Sprint 7 §12 — distincte de `ChecklistItemCriticality` : une pièce BLOCKING peut SUGGÉRER une
 *  priorité HIGH/URGENT à la création depuis la checklist, jamais recopiée automatiquement. */
export const TaskPriority = {
  Low: "LOW",
  Medium: "MEDIUM",
  High: "HIGH",
  Urgent: "URGENT",
} as const;
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export type TaskProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  lotId?: string | undefined;
  checklistItemId?: string | undefined;
  documentId?: string | undefined;
  title: string;
  description?: string | undefined;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: Date | undefined;
  assigneeId?: string | undefined;
  createdBy: string;
  completedBy?: string | undefined;
  completedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

export type TaskUpdate = {
  title?: string | undefined;
  description?: string | undefined;
  priority?: TaskPriority | undefined;
  dueDate?: Date | undefined;
};

/** V2 Sprint 7 §10-17 — travail interne collaboratif, distinct d'un `ChecklistItem` (constat de
 *  conformité DCE) et d'un `TenderMilestone` (échéance métier datée) — jamais fusionnés (mission
 *  §13/§15). `Task DONE` ≠ `ChecklistItem VALIDATED` (mission §13, règle absolue) : cette classe
 *  n'écrit JAMAIS l'état d'un ChecklistItem, même quand `checklistItemId` est renseigné. */
export class Task {
  private constructor(private props: TaskProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    lotId?: string | undefined;
    checklistItemId?: string | undefined;
    documentId?: string | undefined;
    title: string;
    description?: string | undefined;
    priority?: TaskPriority | undefined;
    dueDate?: Date | undefined;
    assigneeId?: string | undefined;
    createdBy: string;
    occurredAt: Date;
  }): Task {
    return new Task({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      lotId: input.lotId,
      checklistItemId: input.checklistItemId,
      documentId: input.documentId,
      title: input.title,
      description: input.description,
      status: TaskStatus.Todo,
      priority: input.priority ?? TaskPriority.Medium,
      dueDate: input.dueDate,
      assigneeId: input.assigneeId,
      createdBy: input.createdBy,
      completedBy: undefined,
      completedAt: undefined,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: TaskProps): Task {
    return new Task(props);
  }

  update(update: TaskUpdate, occurredAt: Date): void {
    if (update.title !== undefined) this.props.title = update.title;
    if (update.description !== undefined) this.props.description = update.description;
    if (update.priority !== undefined) this.props.priority = update.priority;
    if (update.dueDate !== undefined) this.props.dueDate = update.dueDate;
    this.props.updatedAt = occurredAt;
  }

  changeLot(lotId: string | undefined, occurredAt: Date): void {
    this.props.lotId = lotId;
    this.props.updatedAt = occurredAt;
  }

  /** `assigneeId` validé par l'appelant (participant actif du Tender) AVANT cet appel — jamais
   *  vérifié ici (le domaine reste sans dépendance I/O, mission Clean Architecture). */
  assign(assigneeId: string | undefined, occurredAt: Date): void {
    this.props.assigneeId = assigneeId;
    this.props.updatedAt = occurredAt;
  }

  /** V2 Sprint 7 §11 — transition contrôlée. `DONE`/`CANCELLED` sont des statuts terminaux :
   *  repasser par `changeStatus` à un statut non-terminal équivaut à une réouverture, tracée par
   *  l'appelant via `AuditLog.metadata` (previousStatus/newStatus) — jamais silencieuse (mission
   *  §11 "Éviter DONE → TODO silencieusement sans historique"), mais sans table d'historique dédiée
   *  (voir Décision 6 du plan Sprint 7). */
  changeStatus(status: TaskStatus, actorId: string, occurredAt: Date): void {
    this.props.status = status;
    if (status === TaskStatus.Done) {
      this.props.completedAt = occurredAt;
      this.props.completedBy = actorId;
    } else {
      this.props.completedAt = undefined;
      this.props.completedBy = undefined;
    }
    this.props.updatedAt = occurredAt;
  }

  complete(actorId: string, occurredAt: Date): void {
    this.changeStatus(TaskStatus.Done, actorId, occurredAt);
  }

  /** Réouverture explicite (mission §11) — repasse systématiquement à TODO, jamais un statut
   *  intermédiaire deviné. */
  reopen(actorId: string, occurredAt: Date): void {
    this.changeStatus(TaskStatus.Todo, actorId, occurredAt);
  }

  get isTerminal(): boolean {
    return TERMINAL_TASK_STATUSES.includes(this.props.status);
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
  get lotId(): string | undefined {
    return this.props.lotId;
  }
  get checklistItemId(): string | undefined {
    return this.props.checklistItemId;
  }
  get documentId(): string | undefined {
    return this.props.documentId;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string | undefined {
    return this.props.description;
  }
  get status(): TaskStatus {
    return this.props.status;
  }
  get priority(): TaskPriority {
    return this.props.priority;
  }
  get dueDate(): Date | undefined {
    return this.props.dueDate;
  }
  get assigneeId(): string | undefined {
    return this.props.assigneeId;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get completedBy(): string | undefined {
    return this.props.completedBy;
  }
  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
