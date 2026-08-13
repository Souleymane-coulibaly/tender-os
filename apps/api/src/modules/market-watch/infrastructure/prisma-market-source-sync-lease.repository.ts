import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { MarketSourceSyncLeaseRepository } from "../application/ports/market-source-sync-lease.repository";

@Injectable()
export class PrismaMarketSourceSyncLeaseRepository implements MarketSourceSyncLeaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Une seule instruction SQL atomique (INSERT ... ON CONFLICT DO UPDATE ... WHERE) — acquiert le
   *  bail s'il n'existe pas encore OU s'il a expiré, échoue silencieusement (aucune ligne affectée)
   *  s'il est toujours détenu par une autre instance. `Prisma.upsert()` ne permet pas de WHERE
   *  conditionnel sur la branche UPDATE, d'où le SQL brut. */
  async tryClaim(input: { organizationId: string; source: string; now: Date; leaseDurationMs: number }): Promise<boolean> {
    const lockedUntil = new Date(input.now.getTime() + input.leaseDurationMs);
    const result = await this.prisma.$executeRaw`
      INSERT INTO "market_source_sync_leases" ("organization_id", "source", "locked_until")
      VALUES (${input.organizationId}::uuid, ${input.source}, ${lockedUntil})
      ON CONFLICT ("organization_id", "source")
      DO UPDATE SET "locked_until" = ${lockedUntil}
      WHERE "market_source_sync_leases"."locked_until" < ${input.now}
    `;
    return result > 0;
  }
}
