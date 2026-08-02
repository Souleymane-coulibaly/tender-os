import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DeliverableRepository } from "../application/ports/deliverable.repository";
import { Deliverable } from "../domain/deliverable.aggregate";
import type { DeliverableType } from "../domain/deliverable-type";
import { toDeliverableRow, toDomainDeliverable } from "./deliverable.persistence-mapper";

@Injectable()
export class PrismaDeliverableRepository implements DeliverableRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(deliverable: Deliverable): Promise<void> {
    await this.prisma.deliverable.create({ data: toDeliverableRow(deliverable) });
  }

  async findById(input: { organizationId: string; deliverableId: string }): Promise<Deliverable | null> {
    const record = await this.prisma.deliverable.findFirst({ where: { id: input.deliverableId, organizationId: input.organizationId } });
    return record ? toDomainDeliverable(record) : null;
  }

  async findByTenderAndType(input: { organizationId: string; tenderId: string; type: DeliverableType }): Promise<Deliverable | null> {
    const record = await this.prisma.deliverable.findFirst({ where: { organizationId: input.organizationId, tenderId: input.tenderId, type: input.type } });
    return record ? toDomainDeliverable(record) : null;
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<readonly Deliverable[]> {
    const records = await this.prisma.deliverable.findMany({ where: { organizationId: input.organizationId, tenderId: input.tenderId } });
    return records.map(toDomainDeliverable);
  }

  async save(deliverable: Deliverable): Promise<void> {
    await this.prisma.deliverable.update({ where: { id: deliverable.id }, data: toDeliverableRow(deliverable) });
  }
}
