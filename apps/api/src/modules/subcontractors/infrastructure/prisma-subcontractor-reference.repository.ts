import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { SubcontractorReferenceRecord } from "../application/dtos";
import type { EntityScope, SubcontractorReferenceRepository } from "../application/ports/subcontractor.repository";

@Injectable()
export class PrismaSubcontractorReferenceRepository implements SubcontractorReferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<SubcontractorReferenceRecord, "createdAt" | "updatedAt">): Promise<SubcontractorReferenceRecord> {
    return this.prisma.subcontractorReference.create({ data: input });
  }

  async list(input: { organizationId: string; subcontractorProfileId: string }): Promise<SubcontractorReferenceRecord[]> {
    return this.prisma.subcontractorReference.findMany({
      where: { organizationId: input.organizationId, subcontractorProfileId: input.subcontractorProfileId },
      orderBy: { createdAt: "asc" },
    });
  }

  async archive(scope: EntityScope): Promise<boolean> {
    const { count } = await this.prisma.subcontractorReference.updateMany({ where: { id: scope.id, organizationId: scope.organizationId }, data: { status: "ARCHIVED" } });
    return count > 0;
  }
}
