import { Injectable } from "@nestjs/common";
import type { TenderChecklistItem as ChecklistItemRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ChecklistItemRepository } from "../application/ports/checklist-item.repository";
import { ChecklistItem, type ChecklistItemStatus } from "../domain/checklist-item.entity";

function toDomain(record: ChecklistItemRecord): ChecklistItem {
  return ChecklistItem.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    title: record.title,
    description: record.description ?? undefined,
    required: record.required,
    status: record.status as ChecklistItemStatus,
    assignedTo: record.assignedTo ?? undefined,
    dueDate: record.dueDate ?? undefined,
    comment: record.comment ?? undefined,
    completedAt: record.completedAt ?? undefined,
    completedBy: record.completedBy ?? undefined,
    displayOrder: record.displayOrder,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function toPersistence(item: ChecklistItem) {
  return {
    id: item.id,
    organizationId: item.organizationId,
    tenderId: item.tenderId,
    title: item.title,
    description: item.description ?? null,
    required: item.required,
    status: item.status,
    assignedTo: item.assignedTo ?? null,
    dueDate: item.dueDate ?? null,
    comment: item.comment ?? null,
    completedAt: item.completedAt ?? null,
    completedBy: item.completedBy ?? null,
    displayOrder: item.displayOrder,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

@Injectable()
export class PrismaChecklistItemRepository implements ChecklistItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: {
    organizationId: string;
    tenderId: string;
    itemId: string;
  }): Promise<ChecklistItem | null> {
    const record = await this.prisma.tenderChecklistItem.findFirst({
      where: { id: input.itemId, tenderId: input.tenderId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<ChecklistItem[]> {
    const records = await this.prisma.tenderChecklistItem.findMany({
      where: { tenderId: input.tenderId, organizationId: input.organizationId },
      orderBy: { displayOrder: "asc" },
    });
    return records.map(toDomain);
  }

  async save(item: ChecklistItem): Promise<void> {
    const data = toPersistence(item);
    await this.prisma.tenderChecklistItem.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
