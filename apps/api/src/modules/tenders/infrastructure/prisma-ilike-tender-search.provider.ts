import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { TenderSearchCriteria, TenderSearchProvider } from "../application/ports/tender-search-provider";

/** Borne le nombre de candidats — garde-fou simple, à revoir si un vrai moteur de recherche
 *  (OpenSearch) remplace cette implémentation ILIKE (voir tender-search-provider.ts). */
const MAX_CANDIDATES = 500;

@Injectable()
export class PrismaIlikeTenderSearchProvider implements TenderSearchProvider {
  constructor(private readonly prisma: PrismaService) {}

  async findMatchingTenderIds(criteria: TenderSearchCriteria): Promise<string[]> {
    const records = await this.prisma.tender.findMany({
      where: {
        organizationId: criteria.organizationId,
        OR: [
          { title: { contains: criteria.query, mode: "insensitive" } },
          { reference: { contains: criteria.query, mode: "insensitive" } },
          { description: { contains: criteria.query, mode: "insensitive" } },
        ],
      },
      select: { id: true },
      take: MAX_CANDIDATES,
    });

    return records.map((record) => record.id);
  }
}
