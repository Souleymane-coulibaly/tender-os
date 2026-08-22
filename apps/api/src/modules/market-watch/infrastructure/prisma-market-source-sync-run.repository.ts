import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { MarketSourceSyncRunRepository } from "../application/ports/market-source-sync-run.repository";

@Injectable()
export class PrismaMarketSourceSyncRunRepository implements MarketSourceSyncRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  async start(input: { id: string; organizationId: string; source: string; startedAt: Date }): Promise<void> {
    await this.prisma.currentClient().marketSourceSyncRun.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        source: input.source,
        startedAt: input.startedAt,
        status: "RUNNING",
      },
    });
  }

  async complete(input: {
    id: string;
    finishedAt: Date;
    status: "SUCCEEDED" | "FAILED";
    opportunitiesFetched: number;
    opportunitiesCreated: number;
    opportunitiesUpdated: number;
    matchesCreated: number;
    notificationsCreated: number;
    errorSummary?: string | undefined;
  }): Promise<void> {
    await this.prisma.currentClient().marketSourceSyncRun.update({
      where: { id: input.id },
      data: {
        finishedAt: input.finishedAt,
        status: input.status,
        opportunitiesFetched: input.opportunitiesFetched,
        opportunitiesCreated: input.opportunitiesCreated,
        opportunitiesUpdated: input.opportunitiesUpdated,
        matchesCreated: input.matchesCreated,
        notificationsCreated: input.notificationsCreated,
        errorSummary: input.errorSummary ?? null,
      },
    });
  }
}
