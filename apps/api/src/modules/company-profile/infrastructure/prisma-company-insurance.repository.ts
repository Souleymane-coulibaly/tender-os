import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { CompanyInsuranceRecord } from "../application/dtos";
import type { ClientScope, CompanyInsuranceRepository, EntityScope } from "../application/ports/company-satellite.repository";

function toRecord(row: Omit<CompanyInsuranceRecord, "coverageAmount"> & { coverageAmount: { toString(): string } | null }): CompanyInsuranceRecord {
  return { ...row, coverageAmount: row.coverageAmount?.toString() ?? null };
}

@Injectable()
export class PrismaCompanyInsuranceRepository implements CompanyInsuranceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<CompanyInsuranceRecord, "createdAt" | "updatedAt">): Promise<CompanyInsuranceRecord> {
    const row = await this.prisma.companyInsurance.create({ data: input });
    return toRecord(row);
  }

  async update(scope: EntityScope, patch: Partial<Omit<CompanyInsuranceRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyInsuranceRecord | null> {
    const { count } = await this.prisma.companyInsurance.updateMany({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId }, data: patch });
    if (count === 0) return null;
    return this.findById(scope);
  }

  async findById(scope: EntityScope): Promise<CompanyInsuranceRecord | null> {
    const row = await this.prisma.companyInsurance.findFirst({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId } });
    return row ? toRecord(row) : null;
  }

  async list(scope: ClientScope): Promise<CompanyInsuranceRecord[]> {
    const rows = await this.prisma.companyInsurance.findMany({
      where: { organizationId: scope.organizationId, clientAccountId: scope.clientAccountId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toRecord);
  }
}
