import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { TenderActivityEntry, TenderActivityWriter } from "../application/ports/tender-activity-writer";

@Injectable()
export class PrismaTenderActivityWriter implements TenderActivityWriter {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: TenderActivityEntry): Promise<void> {
    await this.prisma.currentClient().tenderActivity.create({
      data: {
        id: randomUUID(),
        organizationId: entry.organizationId,
        tenderId: entry.tenderId,
        actorId: entry.actorId,
        type: entry.type,
        summary: entry.summary,
        metadata: entry.metadata !== undefined ? (entry.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }
}
