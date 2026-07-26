import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  TenderStatusHistoryEntry,
  TenderStatusHistoryRepository,
} from "../application/ports/tender-status-history.repository";

@Injectable()
export class PrismaTenderStatusHistoryRepository implements TenderStatusHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByTender(input: {
    organizationId: string;
    tenderId: string;
  }): Promise<TenderStatusHistoryEntry[]> {
    const records = await this.prisma.tenderStatusHistoryEntry.findMany({
      where: { tenderId: input.tenderId, organizationId: input.organizationId },
      orderBy: { changedAt: "desc" },
    });

    return records.map((record) => ({
      id: record.id,
      previousStatus: record.previousStatus,
      newStatus: record.newStatus,
      reason: record.reason,
      changedBy: record.changedBy,
      changedAt: record.changedAt.toISOString(),
    }));
  }

  async append(input: {
    organizationId: string;
    tenderId: string;
    previousStatus: string | null;
    newStatus: string;
    reason?: string | undefined;
    changedBy: string;
    occurredAt: Date;
  }): Promise<void> {
    await this.prisma.tenderStatusHistoryEntry.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        previousStatus: input.previousStatus,
        newStatus: input.newStatus,
        reason: input.reason ?? null,
        changedBy: input.changedBy,
        changedAt: input.occurredAt,
      },
    });
  }
}
