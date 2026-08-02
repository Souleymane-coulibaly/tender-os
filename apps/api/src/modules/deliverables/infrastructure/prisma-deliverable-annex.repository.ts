import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DeliverableAnnexRepository } from "../application/ports/deliverable-annex.repository";
import type { DeliverableAnnex } from "../domain/deliverable-annex.aggregate";
import { toAnnexRow, toDomainAnnex } from "./deliverable-annex.persistence-mapper";

@Injectable()
export class PrismaDeliverableAnnexRepository implements DeliverableAnnexRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(annex: DeliverableAnnex): Promise<void> {
    await this.prisma.deliverableAnnex.create({ data: toAnnexRow(annex) });
  }

  async findById(input: { organizationId: string; annexId: string }): Promise<DeliverableAnnex | null> {
    const record = await this.prisma.deliverableAnnex.findFirst({ where: { id: input.annexId, organizationId: input.organizationId } });
    return record ? toDomainAnnex(record) : null;
  }

  async listByDeliverable(input: { organizationId: string; deliverableId: string }): Promise<readonly DeliverableAnnex[]> {
    const records = await this.prisma.deliverableAnnex.findMany({
      where: { organizationId: input.organizationId, deliverableId: input.deliverableId },
      orderBy: { order: "asc" },
    });
    return records.map(toDomainAnnex);
  }

  async save(annex: DeliverableAnnex): Promise<void> {
    await this.prisma.deliverableAnnex.update({ where: { id: annex.id }, data: toAnnexRow(annex) });
  }
}
