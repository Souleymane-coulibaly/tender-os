import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { PricingScheduleLineRepository } from "../application/ports/pricing-schedule-line.repository";
import type { PricingScheduleLine } from "../domain/pricing-schedule-line.entity";
import { toDomainPricingScheduleLine, toPricingScheduleLineRow } from "./pricing-schedule-line.persistence-mapper";

@Injectable()
export class PrismaPricingScheduleLineRepository implements PricingScheduleLineRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createMany(lines: readonly PricingScheduleLine[]): Promise<void> {
    if (lines.length === 0) return;
    await this.prisma.currentClient().pricingScheduleLine.createMany({ data: lines.map(toPricingScheduleLineRow) });
  }

  async save(line: PricingScheduleLine): Promise<void> {
    await this.prisma.currentClient().pricingScheduleLine.update({
      where: { id_organizationId: { id: line.id, organizationId: line.organizationId } },
      data: toPricingScheduleLineRow(line),
    });
  }

  async saveMany(lines: readonly PricingScheduleLine[]): Promise<void> {
    for (const line of lines) {
      await this.save(line);
    }
  }

  async findById(input: { organizationId: string; pricingScheduleLineId: string }): Promise<PricingScheduleLine | null> {
    const record = await this.prisma.currentClient().pricingScheduleLine.findFirst({
      where: { id: input.pricingScheduleLineId, organizationId: input.organizationId },
    });
    return record ? toDomainPricingScheduleLine(record) : null;
  }

  async listByVersion(input: { organizationId: string; pricingScheduleVersionId: string }): Promise<readonly PricingScheduleLine[]> {
    const records = await this.prisma.currentClient().pricingScheduleLine.findMany({
      where: { organizationId: input.organizationId, pricingScheduleVersionId: input.pricingScheduleVersionId },
      orderBy: [{ sheetName: "asc" }, { rowNumber: "asc" }],
    });
    return records.map(toDomainPricingScheduleLine);
  }
}
