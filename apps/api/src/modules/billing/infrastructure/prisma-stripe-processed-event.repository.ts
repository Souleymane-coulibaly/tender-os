import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { StripeEventRecordOutcome, StripeProcessedEventRepository } from "../application/ports/stripe-processed-event.repository";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Même motif que `PrismaSignatureProviderEventRepository` (module `signature`) — la contrainte
 * unique `stripe_event_id` est la SEULE autorité réelle de l'idempotence.
 *
 * Correctif audit Codex 22C (P1-01) — sur conflit (événement déjà connu), la reprise
 * `FAILED -> RECEIVED` est un compare-and-set atomique (`updateMany` avec clause WHERE
 * `status = 'FAILED'`, même motif que `consume()`, Sprint 21/22B) : la SEULE autorité réelle de la
 * transition est la clause WHERE SQL, jamais une lecture-puis-écriture inconditionnelle — deux
 * retries réellement simultanés du même `stripeEventId` ne peuvent jamais tous les deux obtenir
 * `RETRY`.
 */
@Injectable()
export class PrismaStripeProcessedEventRepository implements StripeProcessedEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordForProcessing(input: { id: string; stripeEventId: string; eventType: string; receivedAt: Date }): Promise<StripeEventRecordOutcome> {
    try {
      await this.prisma.currentClient().stripeProcessedEvent.create({
        data: { id: input.id, stripeEventId: input.stripeEventId, eventType: input.eventType, receivedAt: input.receivedAt, status: "RECEIVED" },
      });
      return { outcome: "NEW", recordId: input.id };
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }
    }

    const retry = await this.prisma.currentClient().stripeProcessedEvent.updateMany({
      where: { stripeEventId: input.stripeEventId, status: "FAILED" },
      data: { status: "RECEIVED", processedAt: null, errorCode: null },
    });
    if (retry.count === 0) {
      // PROCESSED (doublon réel, succès déjà acquis) OU RECEIVED (traitement concurrent en cours) —
      // dans les deux cas, jamais un second traitement métier ici.
      return { outcome: "SKIP" };
    }

    const existing = await this.prisma.currentClient().stripeProcessedEvent.findUniqueOrThrow({ where: { stripeEventId: input.stripeEventId } });
    return { outcome: "RETRY", recordId: existing.id };
  }

  async markProcessed(input: { id: string; occurredAt: Date }): Promise<void> {
    await this.prisma.currentClient().stripeProcessedEvent.update({ where: { id: input.id }, data: { status: "PROCESSED", processedAt: input.occurredAt } });
  }

  async markFailed(input: { id: string; errorCode: string }): Promise<void> {
    await this.prisma.currentClient().stripeProcessedEvent.update({ where: { id: input.id }, data: { status: "FAILED", errorCode: input.errorCode } });
  }
}
