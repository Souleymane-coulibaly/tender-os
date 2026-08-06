import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { CompanyHumanResourceRecord } from "../application/dtos";
import type { ClientScope, CompanyHumanResourceRepository, EntityScope } from "../application/ports/company-satellite.repository";

@Injectable()
export class PrismaCompanyHumanResourceRepository implements CompanyHumanResourceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<CompanyHumanResourceRecord, "createdAt" | "updatedAt">): Promise<CompanyHumanResourceRecord> {
    return this.prisma.companyHumanResource.create({ data: input });
  }

  async update(scope: EntityScope, patch: Partial<Omit<CompanyHumanResourceRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyHumanResourceRecord | null> {
    const { count } = await this.prisma.companyHumanResource.updateMany({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId }, data: patch });
    if (count === 0) return null;
    return this.findById(scope);
  }

  async findById(scope: EntityScope): Promise<CompanyHumanResourceRecord | null> {
    return this.prisma.companyHumanResource.findFirst({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId } });
  }

  async list(scope: ClientScope): Promise<CompanyHumanResourceRecord[]> {
    return this.prisma.companyHumanResource.findMany({
      where: { organizationId: scope.organizationId, clientAccountId: scope.clientAccountId },
      orderBy: { createdAt: "asc" },
    });
  }
}
