import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { SignatureProviderEvent } from "../domain/signature-provider-event";
import type { SignatureProviderEventRepository } from "../application/ports/signature-provider-event.repository";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Mission Sprint 8A §45 — idempotence via la contrainte unique `(provider, providerEventId)`
 *  (migration). Un doublon ne lève jamais d'exception fatale, `tryRecord` retourne `false`. */
@Injectable()
export class PrismaSignatureProviderEventRepository implements SignatureProviderEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async tryRecord(event: SignatureProviderEvent): Promise<boolean> {
    try {
      await this.prisma.signatureProviderEvent.create({
        data: {
          id: event.id,
          organizationId: event.organizationId ?? null,
          provider: event.provider,
          providerEventId: event.providerEventId ?? null,
          providerTransactionId: event.providerTransactionId ?? null,
          eventType: event.eventType,
          receivedAt: event.receivedAt,
          status: event.status,
          payloadHash: event.payloadHash,
          signatureVerified: event.signatureVerified,
          errorCode: event.errorCode ?? null,
          retryCount: event.retryCount,
        },
      });
      return true;
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        return false;
      }
      throw error;
    }
  }

  async markProcessed(input: { id: string; occurredAt: Date }): Promise<void> {
    await this.prisma.signatureProviderEvent.update({ where: { id: input.id }, data: { status: "PROCESSED", processedAt: input.occurredAt } });
  }

  async markRejected(input: { id: string; errorCode: string }): Promise<void> {
    await this.prisma.signatureProviderEvent.update({ where: { id: input.id }, data: { status: "REJECTED", errorCode: input.errorCode } });
  }
}
