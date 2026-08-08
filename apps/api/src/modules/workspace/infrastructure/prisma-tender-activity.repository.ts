import { Injectable } from "@nestjs/common";
import type { TenderActivity as TenderActivityRecordModel, Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { CreateTenderActivityInput, TenderActivityRecord, TenderActivityRepository } from "../application/ports/tender-activity.repository";
import type { TenderActivityType } from "../domain/tender-activity-type";

function toRecord(record: TenderActivityRecordModel): TenderActivityRecord {
  return {
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    actorId: record.actorId,
    type: record.type as TenderActivityType,
    summary: record.summary,
    metadata: (record.metadata as Record<string, unknown> | null) ?? undefined,
    createdAt: record.createdAt,
  };
}

/** V2 Sprint 7 §51 — pagination stable `createdAt DESC, id DESC` (même motif que
 *  `PrismaTenderRepository.list` : `id` seul comme curseur Prisma natif, l'ordre composite garantit
 *  la reprise exacte), jamais de doublon entre pages. */
@Injectable()
export class PrismaTenderActivityRepository implements TenderActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByTender(input: { organizationId: string; tenderId: string; cursor?: string | undefined; limit: number }): Promise<{ items: TenderActivityRecord[]; nextCursor: string | null }> {
    const records = await this.prisma.currentClient().tenderActivity.findMany({
      where: { organizationId: input.organizationId, tenderId: input.tenderId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = records.length > input.limit;
    const page = hasNextPage ? records.slice(0, input.limit) : records;

    return {
      items: page.map(toRecord),
      nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async create(activity: CreateTenderActivityInput): Promise<void> {
    await this.prisma.currentClient().tenderActivity.create({
      data: {
        id: activity.id,
        organizationId: activity.organizationId,
        tenderId: activity.tenderId,
        actorId: activity.actorId,
        type: activity.type,
        summary: activity.summary,
        ...(activity.metadata !== undefined ? { metadata: activity.metadata as Prisma.InputJsonValue } : {}),
        createdAt: activity.createdAt,
      },
    });
  }
}
