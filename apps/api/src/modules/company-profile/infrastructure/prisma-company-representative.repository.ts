import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { CompanyRepresentativeRecord } from "../application/dtos";
import type { ClientScope, CompanyRepresentativeRepository, EntityScope } from "../application/ports/company-satellite.repository";

@Injectable()
export class PrismaCompanyRepresentativeRepository implements CompanyRepresentativeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<CompanyRepresentativeRecord, "createdAt" | "updatedAt">): Promise<CompanyRepresentativeRecord> {
    return this.prisma.companyRepresentative.create({ data: input });
  }

  async update(scope: EntityScope, patch: Partial<Omit<CompanyRepresentativeRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyRepresentativeRecord | null> {
    const { count } = await this.prisma.companyRepresentative.updateMany({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId }, data: patch });
    if (count === 0) return null;
    return this.findById(scope);
  }

  async findById(scope: EntityScope): Promise<CompanyRepresentativeRecord | null> {
    return this.prisma.companyRepresentative.findFirst({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId } });
  }

  async list(scope: ClientScope): Promise<CompanyRepresentativeRecord[]> {
    return this.prisma.companyRepresentative.findMany({
      where: { organizationId: scope.organizationId, clientAccountId: scope.clientAccountId },
      orderBy: { createdAt: "asc" },
    });
  }
}
