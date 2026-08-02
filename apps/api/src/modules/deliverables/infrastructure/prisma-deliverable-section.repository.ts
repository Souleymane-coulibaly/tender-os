import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DeliverableSectionRepository } from "../application/ports/deliverable-section.repository";
import { DeliverableSection } from "../domain/deliverable-section.aggregate";
import { toDomainSection, toSectionRow } from "./deliverable-section.persistence-mapper";

@Injectable()
export class PrismaDeliverableSectionRepository implements DeliverableSectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createMany(sections: readonly DeliverableSection[]): Promise<void> {
    if (sections.length === 0) return;
    await this.prisma.deliverableSection.createMany({ data: sections.map(toSectionRow) });
  }

  async findById(input: { organizationId: string; sectionId: string }): Promise<DeliverableSection | null> {
    const record = await this.prisma.deliverableSection.findFirst({ where: { id: input.sectionId, organizationId: input.organizationId } });
    return record ? toDomainSection(record) : null;
  }

  async listByDeliverable(input: { organizationId: string; deliverableId: string }): Promise<readonly DeliverableSection[]> {
    const records = await this.prisma.deliverableSection.findMany({
      where: { organizationId: input.organizationId, deliverableId: input.deliverableId },
      orderBy: { order: "asc" },
    });
    return records.map(toDomainSection);
  }

  async save(section: DeliverableSection): Promise<void> {
    await this.prisma.deliverableSection.update({ where: { id: section.id }, data: toSectionRow(section) });
  }
}
