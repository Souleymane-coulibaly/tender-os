import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { QuotaAlertRepository } from "../application/ports/quota-alert.repository";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaQuotaAlertRepository implements QuotaAlertRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordIfNew(input: { organizationId: string; quotaType: string; threshold: number; periodKey: string }): Promise<boolean> {
    try {
      await this.prisma.currentClient().billingQuotaAlertState.create({
        data: { id: randomUUID(), organizationId: input.organizationId, quotaType: input.quotaType, threshold: input.threshold, periodKey: input.periodKey },
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
