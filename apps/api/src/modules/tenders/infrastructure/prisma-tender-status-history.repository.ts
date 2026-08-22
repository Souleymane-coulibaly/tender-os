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
    const records = await this.prisma.currentClient().tenderStatusHistoryEntry.findMany({
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
    // Checkpoint TENDEROS-2.1-P2.3-E1.5, mission §4/§7 (ATOMICITÉ ABANDON) — `currentClient()`
    // (au lieu de `this.prisma` brut) : rejoint la transaction ambiante ouverte par
    // `AtomicTransactionRunner` (voir `AbandonTenderUseCase`) au lieu d'écrire sur une connexion
    // séparée, sans quoi cette écriture ne participerait PAS au rollback d'un échec ultérieur dans la
    // même opération (release Pass, audit, outbox) — état partiel durable, exactement ce que la
    // mission interdit.
    await this.prisma.currentClient().tenderStatusHistoryEntry.create({
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
