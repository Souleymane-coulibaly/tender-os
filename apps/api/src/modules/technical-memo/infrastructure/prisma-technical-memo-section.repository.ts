import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { TechnicalMemoSectionRepository } from "../application/ports/technical-memo-section.repository";
import type { TechnicalMemoSection } from "../domain/technical-memo-section.entity";
import { toDomainTechnicalMemoSection, toTechnicalMemoSectionRow } from "./technical-memo-section.persistence-mapper";

@Injectable()
export class PrismaTechnicalMemoSectionRepository implements TechnicalMemoSectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createMany(sections: readonly TechnicalMemoSection[]): Promise<void> {
    if (sections.length === 0) return;
    await this.prisma.currentClient().technicalMemoSection.createMany({ data: sections.map(toTechnicalMemoSectionRow) });
  }

  async save(section: TechnicalMemoSection): Promise<void> {
    await this.prisma.currentClient().technicalMemoSection.update({
      where: { id_organizationId: { id: section.id, organizationId: section.organizationId } },
      data: toTechnicalMemoSectionRow(section),
    });
  }

  async findById(input: { organizationId: string; technicalMemoSectionId: string }): Promise<TechnicalMemoSection | null> {
    const record = await this.prisma.currentClient().technicalMemoSection.findFirst({
      where: { id: input.technicalMemoSectionId, organizationId: input.organizationId },
    });
    return record ? toDomainTechnicalMemoSection(record) : null;
  }

  async listByMemoId(input: { organizationId: string; technicalMemoId: string }): Promise<readonly TechnicalMemoSection[]> {
    const records = await this.prisma.currentClient().technicalMemoSection.findMany({
      where: { organizationId: input.organizationId, technicalMemoId: input.technicalMemoId },
      orderBy: { order: "asc" },
    });
    return records.map(toDomainTechnicalMemoSection);
  }

  async countByMemoId(input: { organizationId: string; technicalMemoId: string }): Promise<number> {
    return this.prisma.currentClient().technicalMemoSection.count({
      where: { organizationId: input.organizationId, technicalMemoId: input.technicalMemoId },
    });
  }
}
