import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { TrialReminderRepository } from "../application/ports/trial-reminder.repository";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Même motif que `PrismaQuotaAlertRepository` (Sprint 22E) — un simple `create()` protégé par la
 *  contrainte unique réelle est suffisant ici, jamais une transaction ou un `findFirst` préalable
 *  (rien d'autre n'est écrit dans le même mouvement, contrairement au ledger AO). */
@Injectable()
export class PrismaTrialReminderRepository implements TrialReminderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordIfNotSent(input: { organizationId: string; daysRemaining: number; occurredAt: Date }): Promise<boolean> {
    try {
      await this.prisma.currentClient().trialReminderRecord.create({
        data: { id: randomUUID(), organizationId: input.organizationId, daysRemaining: input.daysRemaining, sentAt: input.occurredAt },
      });
      return true;
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        return false;
      }
      throw error;
    }
  }
}
