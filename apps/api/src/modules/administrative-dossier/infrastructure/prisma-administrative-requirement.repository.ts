import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AdministrativeRequirementRepository } from "../application/ports/administrative-requirement.repository";
import type { AdministrativeRequirement } from "../domain/administrative-requirement.aggregate";
import { AdministrativeRequirementValidationStatus } from "../domain/administrative-requirement-validation-status";
import { toAdministrativeRequirementRow, toDomainAdministrativeRequirement } from "./administrative-requirement.persistence-mapper";

@Injectable()
export class PrismaAdministrativeRequirementRepository implements AdministrativeRequirementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(requirement: AdministrativeRequirement): Promise<void> {
    await this.prisma.administrativeRequirement.create({ data: toAdministrativeRequirementRow(requirement) });
  }

  async findById(input: { organizationId: string; requirementId: string }): Promise<AdministrativeRequirement | null> {
    const record = await this.prisma.administrativeRequirement.findFirst({ where: { id: input.requirementId, organizationId: input.organizationId } });
    return record ? toDomainAdministrativeRequirement(record) : null;
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<readonly AdministrativeRequirement[]> {
    const records = await this.prisma.administrativeRequirement.findMany({
      where: { organizationId: input.organizationId, tenderId: input.tenderId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toDomainAdministrativeRequirement);
  }

  async listConfirmedByTender(input: { organizationId: string; tenderId: string }): Promise<readonly AdministrativeRequirement[]> {
    const records = await this.prisma.administrativeRequirement.findMany({
      where: { organizationId: input.organizationId, tenderId: input.tenderId, validationStatus: AdministrativeRequirementValidationStatus.Confirmed },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toDomainAdministrativeRequirement);
  }

  async save(requirement: AdministrativeRequirement): Promise<void> {
    await this.prisma.administrativeRequirement.update({ where: { id: requirement.id }, data: toAdministrativeRequirementRow(requirement) });
  }
}
