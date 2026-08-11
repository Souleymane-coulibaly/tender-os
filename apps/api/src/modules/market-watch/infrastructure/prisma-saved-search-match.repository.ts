import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { SavedSearchMatch } from "../domain/saved-search-match.entity";
import type { SavedSearchMatchPage, SavedSearchMatchRepository } from "../application/ports/saved-search-match.repository";
import { toDomainSavedSearchMatch, toSavedSearchMatchData } from "./saved-search-match.persistence-mapper";

@Injectable()
export class PrismaSavedSearchMatchRepository implements SavedSearchMatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Mission §44/§48 — idempotent via `createMany({skipDuplicates:true})` sur
   *  `@@unique([savedSearchId, externalTenderId])`, même motif que
   *  `PrismaWebhookDeliveryRepository.createIfNotExists` (Sprint 16). */
  async createIfNotExists(match: SavedSearchMatch): Promise<boolean> {
    const result = await this.prisma.currentClient().savedSearchMatch.createMany({ data: [toSavedSearchMatchData(match)], skipDuplicates: true });
    return result.count > 0;
  }

  async save(match: SavedSearchMatch): Promise<void> {
    await this.prisma.currentClient().savedSearchMatch.update({
      where: { id_organizationId: { id: match.id, organizationId: match.organizationId } },
      data: toSavedSearchMatchData(match),
    });
  }

  async findBySavedSearchAndTender(input: { organizationId: string; savedSearchId: string; externalTenderId: string }): Promise<SavedSearchMatch | null> {
    const row = await this.prisma.currentClient().savedSearchMatch.findUnique({
      where: { savedSearchId_externalTenderId: { savedSearchId: input.savedSearchId, externalTenderId: input.externalTenderId } },
    });
    return row && row.organizationId === input.organizationId ? toDomainSavedSearchMatch(row) : null;
  }

  async findById(input: { organizationId: string; matchId: string }): Promise<SavedSearchMatch | null> {
    const row = await this.prisma.currentClient().savedSearchMatch.findFirst({ where: { id: input.matchId, organizationId: input.organizationId } });
    return row ? toDomainSavedSearchMatch(row) : null;
  }

  /** Correctif audit P1-001 — volontairement GLOBAL si `organizationId` omis, même motif que
   *  `PrismaOutboxEventRepository.claimPendingBatch` (mission §65, worker traitant tous les
   *  tenants). CLAIM atomique en UNE seule instruction SQL (`UPDATE ... WHERE id IN (SELECT ...
   *  FOR UPDATE SKIP LOCKED)`) : deux appels concurrents (deux instances API, ou deux ticks qui se
   *  chevauchent) reçoivent des ensembles disjoints, jamais le même match `PENDING` deux fois — plus
   *  besoin d'une transaction explicite, le verrou de ligne pris par la sous-requête est tenu pour
   *  toute la durée de cette unique instruction. Reprend aussi les matches `SENDING` dont le bail
   *  (`updatedAt`) a expiré (crash worker après claim, avant envoi/sauvegarde). */
  async claimPendingEmailBatch(input: { organizationId?: string | undefined; limit: number; now: Date; staleClaimThresholdMs: number }): Promise<SavedSearchMatch[]> {
    const staleBefore = new Date(input.now.getTime() - input.staleClaimThresholdMs);
    const orgFilter = input.organizationId ? Prisma.sql`AND organization_id = ${input.organizationId}::uuid` : Prisma.empty;

    const claimed = await this.prisma.currentClient().$queryRaw<{ id: string }[]>`
      UPDATE saved_search_matches
      SET email_status = 'SENDING', updated_at = ${input.now}
      WHERE id IN (
        SELECT id FROM saved_search_matches
        WHERE (email_status = 'PENDING' OR (email_status = 'SENDING' AND updated_at < ${staleBefore}))
          ${orgFilter}
        ORDER BY created_at ASC
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `;
    if (claimed.length === 0) return [];

    const rows = await this.prisma.currentClient().savedSearchMatch.findMany({ where: { id: { in: claimed.map((row) => row.id) } } });
    return rows.map(toDomainSavedSearchMatch);
  }

  async listBySavedSearch(input: { organizationId: string; savedSearchId: string; limit: number; cursor?: string | undefined }): Promise<SavedSearchMatchPage> {
    const rows = await this.prisma.currentClient().savedSearchMatch.findMany({
      where: { organizationId: input.organizationId, savedSearchId: input.savedSearchId },
      orderBy: [{ score: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = rows.length > input.limit;
    const page = hasNextPage ? rows.slice(0, input.limit) : rows;

    return { items: page.map(toDomainSavedSearchMatch), nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null };
  }
}
