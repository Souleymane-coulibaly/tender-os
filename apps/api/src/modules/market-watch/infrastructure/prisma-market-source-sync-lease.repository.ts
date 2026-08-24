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

  /** Diagnostic runtime E10 (voir le port) — fait expirer immédiatement un bail encore détenu.
   *  Garde `locked_until > now` : un bail déjà expiré (locked_until dans le passé) n'est jamais
   *  ramené à `now` (ce qui le RALLONGERAIT), et l'absence de bail reste un no-op. */
  async release(input: { organizationId: string; source: string; now: Date }): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "market_source_sync_leases"
      SET "locked_until" = ${input.now}
      WHERE "organization_id" = ${input.organizationId}::uuid
        AND "source" = ${input.source}
        AND "locked_until" > ${input.now}
    `;
  }
}
