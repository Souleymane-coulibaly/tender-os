import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { PricingScheduleFinalFileRepository } from "../application/ports/pricing-schedule-final-file.repository";
import type { PricingScheduleFinalFile } from "../domain/pricing-schedule-final-file.value-object";
import { toDomainPricingScheduleFinalFile, toPricingScheduleFinalFileRow } from "./pricing-schedule-final-file.persistence-mapper";

@Injectable()
export class PrismaPricingScheduleFinalFileRepository implements PricingScheduleFinalFileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(finalFile: PricingScheduleFinalFile): Promise<void> {
    await this.prisma.currentClient().pricingScheduleFinalFile.create({ data: toPricingScheduleFinalFileRow(finalFile) });
  }

  async listByVersion(input: { organizationId: string; pricingScheduleVersionId: string }): Promise<readonly PricingScheduleFinalFile[]> {
    const records = await this.prisma.currentClient().pricingScheduleFinalFile.findMany({
      where: { organizationId: input.organizationId, pricingScheduleVersionId: input.pricingScheduleVersionId },
      orderBy: { generatedAt: "desc" },
    });
    return records.map(toDomainPricingScheduleFinalFile);
  }
}
