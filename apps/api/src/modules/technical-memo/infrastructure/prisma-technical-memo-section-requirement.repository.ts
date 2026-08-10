import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { TechnicalMemoSectionRequirementRepository } from "../application/ports/technical-memo-section-requirement.repository";
import type { TechnicalMemoSectionRequirement } from "../domain/technical-memo-section-requirement.entity";
import { toDomainTechnicalMemoSectionRequirement, toTechnicalMemoSectionRequirementRow } from "./technical-memo-section-requirement.persistence-mapper";

@Injectable()
export class PrismaTechnicalMemoSectionRequirementRepository implements TechnicalMemoSectionRequirementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createMany(requirements: readonly TechnicalMemoSectionRequirement[]): Promise<void> {
    if (requirements.length === 0) return;
    await this.prisma.currentClient().technicalMemoSectionRequirement.createMany({ data: requirements.map(toTechnicalMemoSectionRequirementRow) });
  }

  async save(requirement: TechnicalMemoSectionRequirement): Promise<void> {
    await this.prisma.currentClient().technicalMemoSectionRequirement.update({
      where: { id_organizationId: { id: requirement.id, organizationId: requirement.organizationId } },
      data: toTechnicalMemoSectionRequirementRow(requirement),
    });
  }

  async findById(input: { organizationId: string; technicalMemoSectionRequirementId: string }): Promise<TechnicalMemoSectionRequirement | null> {
    const record = await this.prisma.currentClient().technicalMemoSectionRequirement.findFirst({
      where: { id: input.technicalMemoSectionRequirementId, organizationId: input.organizationId },
    });
    return record ? toDomainTechnicalMemoSectionRequirement(record) : null;
  }

  async listBySectionId(input: { organizationId: string; technicalMemoSectionId: string }): Promise<readonly TechnicalMemoSectionRequirement[]> {
    const records = await this.prisma.currentClient().technicalMemoSectionRequirement.findMany({
      where: { organizationId: input.organizationId, technicalMemoSectionId: input.technicalMemoSectionId },
    });
    return records.map(toDomainTechnicalMemoSectionRequirement);
  }

  async listByMemoId(input: { organizationId: string; technicalMemoId: string }): Promise<readonly TechnicalMemoSectionRequirement[]> {
    const records = await this.prisma.currentClient().technicalMemoSectionRequirement.findMany({
      where: { organizationId: input.organizationId, section: { technicalMemoId: input.technicalMemoId } },
    });
    return records.map(toDomainTechnicalMemoSectionRequirement);
  }
}
