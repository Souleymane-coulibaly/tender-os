import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ExternalTenderPromotionRecord, ExternalTenderPromotionRepository } from "../application/ports/external-tender-promotion.repository";

@Injectable()
export class PrismaExternalTenderPromotionRepository implements ExternalTenderPromotionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(record: ExternalTenderPromotionRecord): Promise<void> {
    await this.prisma.currentClient().externalTenderPromotion.create({
      data: {
        id: record.id,
        organizationId: record.organizationId,
        externalTenderId: record.externalTenderId,
        clientAccountId: record.clientAccountId ?? null,
        opportunityId: record.opportunityId,
        createdBy: record.createdBy,
        createdAt: record.createdAt,
      },
    });
  }

  async findByExternalTenderAndClient(input: { organizationId: string; externalTenderId: string; clientAccountId?: string | undefined }): Promise<ExternalTenderPromotionRecord | null> {
    const row = await this.prisma.currentClient().externalTenderPromotion.findFirst({
      where: { organizationId: input.organizationId, externalTenderId: input.externalTenderId, clientAccountId: input.clientAccountId ?? null },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return null;
    return {
      id: row.id,
      organizationId: row.organizationId,
      externalTenderId: row.externalTenderId,
      clientAccountId: row.clientAccountId ?? undefined,
      opportunityId: row.opportunityId,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    };
  }

  /** Correctif audit P1-002 — clé composée (org + marché + client, `clientAccountId` normalisé en
   *  chaîne fixe quand absent pour ne jamais collisionner avec un vrai UUID), même motif que
   *  `PrismaGeneratedDocumentRepository`/`PrismaMessageRepository` (clé composée hashée en un seul
   *  `hashtext`). */
  async lockForPromotion(input: { organizationId: string; externalTenderId: string; clientAccountId?: string | undefined }): Promise<void> {
    const key = `${input.organizationId}:${input.externalTenderId}:${input.clientAccountId ?? "none"}`;
    await this.prisma.currentClient().$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}
