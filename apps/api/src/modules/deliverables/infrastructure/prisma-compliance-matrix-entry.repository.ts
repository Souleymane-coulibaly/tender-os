import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ComplianceMatrixEntryRepository } from "../application/ports/compliance-matrix-entry.repository";
import type { ComplianceMatrixEntry } from "../domain/compliance-matrix-entry.aggregate";
import { toComplianceMatrixEntryRow, toDomainComplianceMatrixEntry } from "./compliance-matrix-entry.persistence-mapper";

@Injectable()
export class PrismaComplianceMatrixEntryRepository implements ComplianceMatrixEntryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(entry: ComplianceMatrixEntry): Promise<void> {
    await this.prisma.complianceMatrixEntry.create({ data: toComplianceMatrixEntryRow(entry) });
  }

  async findById(input: { organizationId: string; entryId: string }): Promise<ComplianceMatrixEntry | null> {
    const record = await this.prisma.complianceMatrixEntry.findFirst({ where: { id: input.entryId, organizationId: input.organizationId } });
    return record ? toDomainComplianceMatrixEntry(record) : null;
  }

  async listByDeliverable(input: { organizationId: string; deliverableId: string }): Promise<readonly ComplianceMatrixEntry[]> {
    const records = await this.prisma.complianceMatrixEntry.findMany({
      where: { organizationId: input.organizationId, deliverableId: input.deliverableId },
      orderBy: { order: "asc" },
    });
    return records.map(toDomainComplianceMatrixEntry);
  }

  async save(entry: ComplianceMatrixEntry): Promise<void> {
    await this.prisma.complianceMatrixEntry.update({ where: { id: entry.id }, data: toComplianceMatrixEntryRow(entry) });
  }
}
