import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { PricingScheduleRepository } from "../application/ports/pricing-schedule.repository";
import type { PricingSchedule } from "../domain/pricing-schedule.aggregate";
import { toDomainPricingSchedule, toPricingScheduleRow } from "./pricing-schedule.persistence-mapper";

@Injectable()
export class PrismaPricingScheduleRepository implements PricingScheduleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(schedule: PricingSchedule): Promise<void> {
    await this.prisma.currentClient().pricingSchedule.create({ data: toPricingScheduleRow(schedule) });
  }

  async save(schedule: PricingSchedule): Promise<void> {
    await this.prisma.currentClient().pricingSchedule.update({
      where: { id_organizationId: { id: schedule.id, organizationId: schedule.organizationId } },
      data: toPricingScheduleRow(schedule),
    });
  }

  async findById(input: { organizationId: string; pricingScheduleId: string }): Promise<PricingSchedule | null> {
    const record = await this.prisma.currentClient().pricingSchedule.findFirst({
      where: { id: input.pricingScheduleId, organizationId: input.organizationId },
    });
    return record ? toDomainPricingSchedule(record) : null;
  }

  async findByScope(input: {
    organizationId: string;
    tenderId: string;
    lotId: string | null;
    clientAccountId: string;
    sourceDocumentId: string;
  }): Promise<PricingSchedule | null> {
    const record = await this.prisma.currentClient().pricingSchedule.findFirst({
      where: {
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        lotId: input.lotId,
        clientAccountId: input.clientAccountId,
        sourceDocumentId: input.sourceDocumentId,
      },
    });
    return record ? toDomainPricingSchedule(record) : null;
  }

  async list(input: { organizationId: string; tenderId: string; lotId?: string | undefined; clientAccountId?: string | undefined }): Promise<readonly PricingSchedule[]> {
    const records = await this.prisma.currentClient().pricingSchedule.findMany({
      where: {
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        ...(input.lotId !== undefined ? { lotId: input.lotId } : {}),
        ...(input.clientAccountId !== undefined ? { clientAccountId: input.clientAccountId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return records.map(toDomainPricingSchedule);
  }
}
