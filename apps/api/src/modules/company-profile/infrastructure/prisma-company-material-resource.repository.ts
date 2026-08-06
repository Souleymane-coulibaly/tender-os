import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { CompanyMaterialResourceRecord } from "../application/dtos";
import type { ClientScope, CompanyMaterialResourceRepository, EntityScope } from "../application/ports/company-satellite.repository";

@Injectable()
export class PrismaCompanyMaterialResourceRepository implements CompanyMaterialResourceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<CompanyMaterialResourceRecord, "createdAt" | "updatedAt">): Promise<CompanyMaterialResourceRecord> {
    return this.prisma.companyMaterialResource.create({ data: input });
  }

  async update(scope: EntityScope, patch: Partial<Omit<CompanyMaterialResourceRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyMaterialResourceRecord | null> {
    const { count } = await this.prisma.companyMaterialResource.updateMany({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId }, data: patch });
    if (count === 0) return null;
    return this.findById(scope);
  }

  async findById(scope: EntityScope): Promise<CompanyMaterialResourceRecord | null> {
    return this.prisma.companyMaterialResource.findFirst({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId } });
  }

  async list(scope: ClientScope): Promise<CompanyMaterialResourceRecord[]> {
    return this.prisma.companyMaterialResource.findMany({
      where: { organizationId: scope.organizationId, clientAccountId: scope.clientAccountId },
      orderBy: { createdAt: "asc" },
    });
  }
}
