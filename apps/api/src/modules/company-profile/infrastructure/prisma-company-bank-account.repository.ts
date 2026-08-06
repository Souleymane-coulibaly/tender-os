import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { CompanyBankAccountRecord } from "../application/dtos";
import type { ClientScope, CompanyBankAccountRepository, EntityScope } from "../application/ports/company-satellite.repository";

@Injectable()
export class PrismaCompanyBankAccountRepository implements CompanyBankAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<CompanyBankAccountRecord, "createdAt" | "updatedAt">): Promise<CompanyBankAccountRecord> {
    return this.prisma.companyBankAccount.create({ data: input });
  }

  async update(scope: EntityScope, patch: Partial<Omit<CompanyBankAccountRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyBankAccountRecord | null> {
    const { count } = await this.prisma.companyBankAccount.updateMany({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId }, data: patch });
    if (count === 0) return null;
    return this.findById(scope);
  }

  async findById(scope: EntityScope): Promise<CompanyBankAccountRecord | null> {
    return this.prisma.companyBankAccount.findFirst({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId } });
  }

  async list(scope: ClientScope): Promise<CompanyBankAccountRecord[]> {
    return this.prisma.companyBankAccount.findMany({
      where: { organizationId: scope.organizationId, clientAccountId: scope.clientAccountId },
      orderBy: { createdAt: "asc" },
    });
  }
}
