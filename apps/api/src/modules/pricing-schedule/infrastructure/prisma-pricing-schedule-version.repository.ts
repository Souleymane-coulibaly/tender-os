import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { PricingScheduleVersionRepository } from "../application/ports/pricing-schedule-version.repository";
import type { PricingScheduleVersion } from "../domain/pricing-schedule-version.entity";
import { toDomainPricingScheduleVersion, toPricingScheduleVersionRow } from "./pricing-schedule-version.persistence-mapper";

@Injectable()
export class PrismaPricingScheduleVersionRepository implements PricingScheduleVersionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(version: PricingScheduleVersion): Promise<void> {
    await this.prisma.currentClient().pricingScheduleVersion.create({ data: toPricingScheduleVersionRow(version) });
  }

  async save(version: PricingScheduleVersion): Promise<void> {
    await this.prisma.currentClient().pricingScheduleVersion.update({
      where: { id_organizationId: { id: version.id, organizationId: version.organizationId } },
      data: toPricingScheduleVersionRow(version),
    });
  }

  async findById(input: { organizationId: string; pricingScheduleVersionId: string }): Promise<PricingScheduleVersion | null> {
    const record = await this.prisma.currentClient().pricingScheduleVersion.findFirst({
      where: { id: input.pricingScheduleVersionId, organizationId: input.organizationId },
    });
    return record ? toDomainPricingScheduleVersion(record) : null;
  }

  async list(input: { organizationId: string; pricingScheduleId: string }): Promise<readonly PricingScheduleVersion[]> {
    const records = await this.prisma.currentClient().pricingScheduleVersion.findMany({
      where: { organizationId: input.organizationId, pricingScheduleId: input.pricingScheduleId },
      orderBy: { versionNumber: "desc" },
    });
    return records.map(toDomainPricingScheduleVersion);
  }
}
