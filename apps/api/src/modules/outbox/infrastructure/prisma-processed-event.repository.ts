import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ProcessedEventRepository } from "../application/ports/processed-event.repository";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaProcessedEventRepository implements ProcessedEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordProcessed(input: { organizationId: string; outboxEventId: string; consumerName: string; result?: string | undefined }): Promise<void> {
    try {
      await this.prisma.processedEvent.create({
        data: {
          id: randomUUID(),
          organizationId: input.organizationId,
          outboxEventId: input.outboxEventId,
          consumerName: input.consumerName,
          result: input.result ?? null,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }
      // Déjà traité par ce consommateur pour cet événement — idempotent, pas une erreur.
    }
  }

  async wasProcessedBy(input: { outboxEventId: string; consumerName: string }): Promise<boolean> {
    const existing = await this.prisma.processedEvent.findUnique({
      where: { outboxEventId_consumerName: { outboxEventId: input.outboxEventId, consumerName: input.consumerName } },
    });
    return existing !== null;
  }
}
