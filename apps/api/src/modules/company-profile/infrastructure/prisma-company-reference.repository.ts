import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { CompanyReferenceDocumentRecord, CompanyReferenceRecord } from "../application/dtos";
import type { ClientScope, CompanyReferenceDocumentRepository, CompanyReferenceRepository, EntityScope } from "../application/ports/company-satellite.repository";

function toRecord(row: Omit<CompanyReferenceRecord, "amountValue"> & { amountValue: { toString(): string } | null }): CompanyReferenceRecord {
  return { ...row, amountValue: row.amountValue?.toString() ?? null };
}

@Injectable()
export class PrismaCompanyReferenceRepository implements CompanyReferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<CompanyReferenceRecord, "createdAt" | "updatedAt">): Promise<CompanyReferenceRecord> {
    const row = await this.prisma.companyReference.create({ data: input });
    return toRecord(row);
  }

  async update(scope: EntityScope, patch: Partial<Omit<CompanyReferenceRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyReferenceRecord | null> {
    const { count } = await this.prisma.companyReference.updateMany({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId }, data: patch });
    if (count === 0) return null;
    return this.findById(scope);
  }

  async findById(scope: EntityScope): Promise<CompanyReferenceRecord | null> {
    const row = await this.prisma.companyReference.findFirst({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId } });
    return row ? toRecord(row) : null;
  }

  async list(scope: ClientScope): Promise<CompanyReferenceRecord[]> {
    const rows = await this.prisma.companyReference.findMany({
      where: { organizationId: scope.organizationId, clientAccountId: scope.clientAccountId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toRecord);
  }
}

@Injectable()
export class PrismaCompanyReferenceDocumentRepository implements CompanyReferenceDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<CompanyReferenceDocumentRecord, "createdAt">): Promise<CompanyReferenceDocumentRecord> {
    return this.prisma.companyReferenceDocument.create({ data: input });
  }

  async list(input: { organizationId: string; companyReferenceId: string }): Promise<CompanyReferenceDocumentRecord[]> {
    return this.prisma.companyReferenceDocument.findMany({
      where: { organizationId: input.organizationId, companyReferenceId: input.companyReferenceId },
      orderBy: { createdAt: "asc" },
    });
  }
}
