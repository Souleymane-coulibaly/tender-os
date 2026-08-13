import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  PlatformDeadLetterEventPage,
  PlatformDeadLetterEventReader,
} from "../application/ports/platform-dead-letter-event.port";

/** Lit `dead_letter_events` (docs/04-architecture/DATABASE_DESIGN.md, `outbox` module) — même
 *  motif de pagination cursor que `PrismaPlatformAuditLog` (`id` comme curseur, `movedAt` comme tri
 *  primaire). `organizationId` filtre optionnellement une organisation précise ; omis, la vue est
 *  cross-tenant (c'est tout l'intérêt d'un back-office plateforme). */
@Injectable()
export class PrismaPlatformDeadLetterEvents implements PlatformDeadLetterEventReader {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: { cursor?: string | undefined; limit: number; organizationId?: string | undefined }): Promise<PlatformDeadLetterEventPage> {
    const records = await this.prisma.deadLetterEvent.findMany({
      ...(input.organizationId ? { where: { organizationId: input.organizationId } } : {}),
      orderBy: [{ movedAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = records.length > input.limit;
    const page = hasNextPage ? records.slice(0, input.limit) : records;

    return {
      items: page.map((record) => ({
        id: record.id,
        organizationId: record.organizationId,
        outboxEventId: record.outboxEventId,
        eventType: record.eventType,
        aggregateType: record.aggregateType,
        aggregateId: record.aggregateId,
        failureReason: record.failureReason,
        attemptCount: record.attemptCount,
        movedAt: record.movedAt.toISOString(),
      })),
      nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null,
    };
  }
}
