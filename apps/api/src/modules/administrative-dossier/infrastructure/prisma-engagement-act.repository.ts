import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { EngagementActRepository } from "../application/ports/engagement-act.repository";
import type { EngagementAct } from "../domain/engagement-act.aggregate";
import { DuplicateEngagementActError } from "../domain/errors";
import { toDomainEngagementAct, toEngagementActRow } from "./engagement-act.persistence-mapper";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaEngagementActRepository implements EngagementActRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(act: EngagementAct): Promise<void> {
    try {
      await this.prisma.engagementAct.create({ data: toEngagementActRow(act) });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DuplicateEngagementActError();
      }
      throw error;
    }
  }

  async findById(input: { organizationId: string; engagementActId: string }): Promise<EngagementAct | null> {
    const record = await this.prisma.engagementAct.findFirst({ where: { id: input.engagementActId, organizationId: input.organizationId } });
    return record ? toDomainEngagementAct(record) : null;
  }

  async findByTenderId(input: { organizationId: string; tenderId: string }): Promise<EngagementAct | null> {
    const record = await this.prisma.engagementAct.findFirst({ where: { organizationId: input.organizationId, tenderId: input.tenderId } });
    return record ? toDomainEngagementAct(record) : null;
  }

  async save(act: EngagementAct): Promise<void> {
    await this.prisma.engagementAct.update({ where: { id: act.id }, data: toEngagementActRow(act) });
  }
}
