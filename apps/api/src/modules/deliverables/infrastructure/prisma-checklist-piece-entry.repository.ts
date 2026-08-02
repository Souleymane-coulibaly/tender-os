import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ChecklistPieceEntryRepository } from "../application/ports/checklist-piece-entry.repository";
import type { ChecklistPieceEntry } from "../domain/checklist-piece-entry.aggregate";
import { toChecklistPieceEntryRow, toDomainChecklistPieceEntry } from "./checklist-piece-entry.persistence-mapper";

@Injectable()
export class PrismaChecklistPieceEntryRepository implements ChecklistPieceEntryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(entry: ChecklistPieceEntry): Promise<void> {
    await this.prisma.checklistPieceEntry.create({ data: toChecklistPieceEntryRow(entry) });
  }

  async findById(input: { organizationId: string; entryId: string }): Promise<ChecklistPieceEntry | null> {
    const record = await this.prisma.checklistPieceEntry.findFirst({ where: { id: input.entryId, organizationId: input.organizationId } });
    return record ? toDomainChecklistPieceEntry(record) : null;
  }

  async listByDeliverable(input: { organizationId: string; deliverableId: string }): Promise<readonly ChecklistPieceEntry[]> {
    const records = await this.prisma.checklistPieceEntry.findMany({
      where: { organizationId: input.organizationId, deliverableId: input.deliverableId },
      orderBy: { order: "asc" },
    });
    return records.map(toDomainChecklistPieceEntry);
  }

  async save(entry: ChecklistPieceEntry): Promise<void> {
    await this.prisma.checklistPieceEntry.update({ where: { id: entry.id }, data: toChecklistPieceEntryRow(entry) });
  }
}
