import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { SubcontractorInsuranceRecord } from "../application/dtos";
import type { EntityScope, SubcontractorInsuranceRepository } from "../application/ports/subcontractor.repository";

@Injectable()
export class PrismaSubcontractorInsuranceRepository implements SubcontractorInsuranceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<SubcontractorInsuranceRecord, "createdAt" | "updatedAt">): Promise<SubcontractorInsuranceRecord> {
    return this.prisma.subcontractorInsurance.create({ data: input });
  }

  async list(input: { organizationId: string; subcontractorProfileId: string }): Promise<SubcontractorInsuranceRecord[]> {
    return this.prisma.subcontractorInsurance.findMany({
      where: { organizationId: input.organizationId, subcontractorProfileId: input.subcontractorProfileId },
      orderBy: { createdAt: "asc" },
    });
  }

  async archive(scope: EntityScope): Promise<boolean> {
    const { count } = await this.prisma.subcontractorInsurance.updateMany({ where: { id: scope.id, organizationId: scope.organizationId }, data: { status: "ARCHIVED" } });
    return count > 0;
  }
}
