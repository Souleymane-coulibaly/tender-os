import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { CompanyCertificationRecord } from "../application/dtos";
import type { ClientScope, CompanyCertificationRepository, EntityScope } from "../application/ports/company-satellite.repository";

@Injectable()
export class PrismaCompanyCertificationRepository implements CompanyCertificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<CompanyCertificationRecord, "createdAt" | "updatedAt">): Promise<CompanyCertificationRecord> {
    return this.prisma.companyCertification.create({ data: input });
  }

  async update(scope: EntityScope, patch: Partial<Omit<CompanyCertificationRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyCertificationRecord | null> {
    const { count } = await this.prisma.companyCertification.updateMany({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId }, data: patch });
    if (count === 0) return null;
    return this.findById(scope);
  }

  async findById(scope: EntityScope): Promise<CompanyCertificationRecord | null> {
    return this.prisma.companyCertification.findFirst({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId } });
  }

  async list(scope: ClientScope): Promise<CompanyCertificationRecord[]> {
    return this.prisma.companyCertification.findMany({
      where: { organizationId: scope.organizationId, clientAccountId: scope.clientAccountId },
      orderBy: { createdAt: "asc" },
    });
  }
}
