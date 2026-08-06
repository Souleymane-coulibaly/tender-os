import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { SubcontractorCertificationRecord } from "../application/dtos";
import type { EntityScope, SubcontractorCertificationRepository } from "../application/ports/subcontractor.repository";

@Injectable()
export class PrismaSubcontractorCertificationRepository implements SubcontractorCertificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<SubcontractorCertificationRecord, "createdAt" | "updatedAt">): Promise<SubcontractorCertificationRecord> {
    return this.prisma.subcontractorCertification.create({ data: input });
  }

  async list(input: { organizationId: string; subcontractorProfileId: string }): Promise<SubcontractorCertificationRecord[]> {
    return this.prisma.subcontractorCertification.findMany({
      where: { organizationId: input.organizationId, subcontractorProfileId: input.subcontractorProfileId },
      orderBy: { createdAt: "asc" },
    });
  }

  async archive(scope: EntityScope): Promise<boolean> {
    const { count } = await this.prisma.subcontractorCertification.updateMany({ where: { id: scope.id, organizationId: scope.organizationId }, data: { status: "ARCHIVED" } });
    return count > 0;
  }
}
