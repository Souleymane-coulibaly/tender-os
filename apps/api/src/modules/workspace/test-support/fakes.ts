import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";
import type { ApprovalRequest } from "../domain/approval-request.entity";
import type { Comment } from "../domain/comment.entity";
import type { Mention } from "../domain/mention.entity";
import type { Task } from "../domain/task.entity";
import { TaskStatus } from "../domain/task.entity";
import type { TenderParticipant } from "../domain/tender-participant.entity";
import type { AtomicTransactionRunner } from "../application/ports/atomic-transaction-runner";
import type { AuditLogWriter, WorkspaceAuditLogEntry } from "../application/ports/audit-log-writer";
import type { ApprovalRequestRepository } from "../application/ports/approval-request.repository";
import type { CommentRepository } from "../application/ports/comment.repository";
import type { MentionRepository } from "../application/ports/mention.repository";
import type { TaskListFilters, TaskRepository } from "../application/ports/task.repository";
import type { TenderActivityRepository, CreateTenderActivityInput, TenderActivityRecord } from "../application/ports/tender-activity.repository";
import type { TenderParticipantRepository } from "../application/ports/tender-participant.repository";

export class FixedClock implements Clock {
  constructor(private readonly value: Date = new Date("2026-01-01T00:00:00.000Z")) {}
  now(): Date {
    return this.value;
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;
  generate(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

export class FakeOutboxWriter {
  readonly events: unknown[] = [];
  async write(input: { organizationId: string; events: readonly unknown[] }): Promise<void> {
    this.events.push(...input.events);
  }
}

export class InMemoryAuditLogWriter implements AuditLogWriter {
  readonly entries: WorkspaceAuditLogEntry[] = [];
  async record(entry: WorkspaceAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

/** Passthrough — pour les tests unitaires (fakes en mémoire, jamais de vraie transaction Postgres à
 *  rejoindre, donc rien à faire rejoindre par `run`). La correction elle-même (correctif audit Codex
 *  P1-02) est structurelle : `PrismaAtomicTransactionRunner` (implémentation réelle) ouvre une vraie
 *  transaction Postgres que tous les repositories/writers rejoignent via `PrismaService.currentClient()`
 *  — motif identique, déjà éprouvé, à `opportunity`/`ai-suggestion-bridge`. */
export class FakeAtomicTransactionRunner implements AtomicTransactionRunner {
  async run<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

export class InMemoryTenderParticipantRepository implements TenderParticipantRepository {
  readonly participants: TenderParticipant[] = [];

  async findById(input: { organizationId: string; tenderId: string; participantId: string }): Promise<TenderParticipant | null> {
    return this.participants.find((p) => p.id === input.participantId && p.tenderId === input.tenderId && p.organizationId === input.organizationId) ?? null;
  }

  async findActiveByUser(input: { organizationId: string; tenderId: string; userId: string }): Promise<TenderParticipant | null> {
    return this.participants.find((p) => p.organizationId === input.organizationId && p.tenderId === input.tenderId && p.userId === input.userId && p.isActive) ?? null;
  }

  async listActiveByTender(input: { organizationId: string; tenderId: string }): Promise<TenderParticipant[]> {
    return this.participants.filter((p) => p.organizationId === input.organizationId && p.tenderId === input.tenderId && p.isActive);
  }

  async save(participant: TenderParticipant): Promise<void> {
    const index = this.participants.findIndex((p) => p.id === participant.id);
    if (index === -1) this.participants.push(participant);
    else this.participants[index] = participant;
  }
}

export class InMemoryTaskRepository implements TaskRepository {
  readonly tasks: Task[] = [];

  async findById(input: { organizationId: string; tenderId: string; taskId: string }): Promise<Task | null> {
    return this.tasks.find((t) => t.id === input.taskId && t.tenderId === input.tenderId && t.organizationId === input.organizationId) ?? null;
  }

  async listByTender(input: { organizationId: string; tenderId: string } & TaskListFilters): Promise<Task[]> {
    return this.tasks.filter((t) => t.organizationId === input.organizationId && t.tenderId === input.tenderId);
  }

  async listByAssignee(input: { organizationId: string; assigneeId: string; restrictToClientAccountIds?: readonly string[] | undefined } & TaskListFilters): Promise<Task[]> {
    return this.tasks.filter((t) => t.organizationId === input.organizationId && t.assigneeId === input.assigneeId);
  }

  async save(task: Task): Promise<void> {
    const index = this.tasks.findIndex((t) => t.id === task.id);
    if (index === -1) this.tasks.push(task);
    else this.tasks[index] = task;
  }
}

export class InMemoryCommentRepository implements CommentRepository {
  readonly comments: Comment[] = [];
  readonly createWithMentionsCalls: { comment: Comment; mentions: readonly Mention[] }[] = [];

  constructor(private readonly mentionRepository?: InMemoryMentionRepository) {}

  async findById(input: { organizationId: string; commentId: string }): Promise<Comment | null> {
    return this.comments.find((c) => c.id === input.commentId && c.organizationId === input.organizationId) ?? null;
  }

  async listByEntity(input: { organizationId: string; tenderId: string; entityType: string; entityId: string }): Promise<Comment[]> {
    return this.comments.filter(
      (c) => c.organizationId === input.organizationId && c.tenderId === input.tenderId && c.entityType === input.entityType && c.entityId === input.entityId,
    );
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<Comment[]> {
    return this.comments.filter((c) => c.organizationId === input.organizationId && c.tenderId === input.tenderId);
  }

  async createWithMentions(comment: Comment, mentions: readonly Mention[]): Promise<void> {
    this.createWithMentionsCalls.push({ comment, mentions });
    this.comments.push(comment);
    for (const mention of mentions) {
      await this.mentionRepository?.create(mention);
    }
  }

  async save(comment: Comment): Promise<void> {
    const index = this.comments.findIndex((c) => c.id === comment.id);
    if (index === -1) this.comments.push(comment);
    else this.comments[index] = comment;
  }
}

export class InMemoryMentionRepository implements MentionRepository {
  readonly mentions: Mention[] = [];

  async listByComment(input: { organizationId: string; commentId: string }): Promise<Mention[]> {
    return this.mentions.filter((m) => m.organizationId === input.organizationId && m.commentId === input.commentId);
  }

  async listByComments(input: { organizationId: string; commentIds: readonly string[] }): Promise<Mention[]> {
    return this.mentions.filter((m) => m.organizationId === input.organizationId && input.commentIds.includes(m.commentId));
  }

  async create(mention: Mention): Promise<void> {
    this.mentions.push(mention);
  }
}

export class InMemoryApprovalRequestRepository implements ApprovalRequestRepository {
  readonly approvals: ApprovalRequest[] = [];

  async findById(input: { organizationId: string; tenderId: string; approvalId: string }): Promise<ApprovalRequest | null> {
    return this.approvals.find((a) => a.id === input.approvalId && a.tenderId === input.tenderId && a.organizationId === input.organizationId) ?? null;
  }

  async listByTender(input: { organizationId: string; tenderId: string; status?: string | undefined }): Promise<ApprovalRequest[]> {
    return this.approvals.filter((a) => a.organizationId === input.organizationId && a.tenderId === input.tenderId && (!input.status || a.status === input.status));
  }

  async listByReviewer(input: { organizationId: string; reviewerId: string; restrictToClientAccountIds?: readonly string[] | undefined; status?: string | undefined }): Promise<ApprovalRequest[]> {
    return this.approvals.filter((a) => a.organizationId === input.organizationId && a.reviewerId === input.reviewerId && (!input.status || a.status === input.status));
  }

  /** Checkpoint TENDEROS-2.1-P2.3-E12.1 — dérivé de `listByReviewer` pour que le fake ne puisse pas,
   *  lui non plus, faire diverger le compteur de la liste. */
  async countByReviewer(input: { organizationId: string; reviewerId: string; restrictToClientAccountIds?: readonly string[] | undefined; status?: string | undefined }): Promise<number> {
    return (await this.listByReviewer(input)).length;
  }

  async save(approval: ApprovalRequest): Promise<void> {
    const index = this.approvals.findIndex((a) => a.id === approval.id);
    if (index === -1) this.approvals.push(approval);
    else this.approvals[index] = approval;
  }

  async reviewLocked(input: { organizationId: string; tenderId: string; approvalId: string }, decide: (approval: ApprovalRequest) => void): Promise<ApprovalRequest> {
    const approval = await this.findById(input);
    if (!approval) {
      throw new Error("ApprovalRequestNotFoundError");
    }
    decide(approval);
    await this.save(approval);
    return approval;
  }
}

export class InMemoryTenderActivityRepository implements TenderActivityRepository {
  readonly activities: TenderActivityRecord[] = [];

  async listByTender(input: { organizationId: string; tenderId: string; cursor?: string | undefined; limit: number }): Promise<{ items: TenderActivityRecord[]; nextCursor: string | null }> {
    const items = this.activities.filter((a) => a.organizationId === input.organizationId && a.tenderId === input.tenderId);
    return { items: items.slice(0, input.limit), nextCursor: null };
  }

  async listByTenderIds(input: { organizationId: string; tenderIds: readonly string[]; limit: number }): Promise<TenderActivityRecord[]> {
    return this.activities
      .filter((a) => a.organizationId === input.organizationId && input.tenderIds.includes(a.tenderId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, input.limit);
  }

  async create(activity: CreateTenderActivityInput): Promise<void> {
    this.activities.push(activity);
  }
}

export { TaskStatus };
