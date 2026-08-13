import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Task as TaskRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { TaskListFilters, TaskRepository } from "../application/ports/task.repository";
import { Task, TaskStatus, type TaskPriority } from "../domain/task.entity";

function toDomain(record: TaskRecord): Task {
  return Task.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    lotId: record.lotId ?? undefined,
    checklistItemId: record.checklistItemId ?? undefined,
    documentId: record.documentId ?? undefined,
    title: record.title,
    description: record.description ?? undefined,
    status: record.status as TaskStatus,
    priority: record.priority as TaskPriority,
    dueDate: record.dueDate ?? undefined,
    assigneeId: record.assigneeId ?? undefined,
    createdBy: record.createdBy,
    completedBy: record.completedBy ?? undefined,
    completedAt: record.completedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function toPersistence(task: Task) {
  return {
    id: task.id,
    organizationId: task.organizationId,
    tenderId: task.tenderId,
    lotId: task.lotId ?? null,
    checklistItemId: task.checklistItemId ?? null,
    documentId: task.documentId ?? null,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ?? null,
    assigneeId: task.assigneeId ?? null,
    createdBy: task.createdBy,
    completedBy: task.completedBy ?? null,
    completedAt: task.completedAt ?? null,
    updatedAt: task.updatedAt,
  };
}

function toWhereFilters(filters: TaskListFilters): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {};
  if (filters.status !== undefined) where.status = { in: [...filters.status] };
  if (filters.priority !== undefined) where.priority = filters.priority;
  if (filters.assigneeId !== undefined) where.assigneeId = filters.assigneeId;
  if (filters.lotId !== undefined) where.lotId = filters.lotId;
  if (filters.checklistItemId !== undefined) where.checklistItemId = filters.checklistItemId;
  if (filters.overdueOnly) {
    where.dueDate = { lt: new Date() };
    where.status = { notIn: [TaskStatus.Done, TaskStatus.Cancelled] };
  }
  if (filters.dueSoonBefore !== undefined) {
    where.dueDate = { ...(where.dueDate as object | undefined), lte: filters.dueSoonBefore, gte: new Date() };
    where.status = { notIn: [TaskStatus.Done, TaskStatus.Cancelled] };
  }
  return where;
}

/** Sprint 21 (hardening) — mission §29/§30 : ni `listByTender` ni `listByAssignee` n'imposaient
 *  jusqu'ici de borne — une requête `findMany` littéralement illimitée pour un Tender/utilisateur
 *  avec un volume anormal de tâches. Borne fixe (pas un paramètre client) : aucune UI de pagination
 *  n'existe pour ces listes aujourd'hui (mission §31 — "ne pas migrer toute l'app par principe"),
 *  ce filet de sécurité suffit tant qu'un besoin réel de pagination complète ne se manifeste pas. */
const MAX_TASKS_PER_QUERY = 1000;

@Injectable()
export class PrismaTaskRepository implements TaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; tenderId: string; taskId: string }): Promise<Task | null> {
    const record = await this.prisma.currentClient().task.findFirst({
      where: { id: input.taskId, tenderId: input.tenderId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async listByTender(input: { organizationId: string; tenderId: string } & TaskListFilters): Promise<Task[]> {
    const records = await this.prisma.currentClient().task.findMany({
      where: { organizationId: input.organizationId, tenderId: input.tenderId, ...toWhereFilters(input) },
      orderBy: { createdAt: "desc" },
      take: MAX_TASKS_PER_QUERY,
    });
    return records.map(toDomain);
  }

  async listByAssignee(input: { organizationId: string; assigneeId: string; restrictToClientAccountIds?: readonly string[] | undefined } & TaskListFilters): Promise<Task[]> {
    const records = await this.prisma.currentClient().task.findMany({
      where: {
        organizationId: input.organizationId,
        assigneeId: input.assigneeId,
        ...toWhereFilters(input),
        ...(input.restrictToClientAccountIds !== undefined ? { tender: { clientAccountId: { in: [...input.restrictToClientAccountIds] } } } : {}),
      },
      orderBy: { dueDate: "asc" },
      take: MAX_TASKS_PER_QUERY,
    });
    return records.map(toDomain);
  }

  async save(task: Task): Promise<void> {
    const data = toPersistence(task);
    await this.prisma.currentClient().task.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
