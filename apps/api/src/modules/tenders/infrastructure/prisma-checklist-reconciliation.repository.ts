import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ChecklistReconciliationRepository, ChecklistReconciliationState } from "../application/ports/checklist-reconciliation.repository";

@Injectable()
export class PrismaChecklistReconciliationRepository implements ChecklistReconciliationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(input: { organizationId: string; tenderId: string }): Promise<ChecklistReconciliationState | null> {
    const record = await this.prisma.currentClient().tenderChecklistReconciliation.findFirst({
      where: { organizationId: input.organizationId, tenderId: input.tenderId },
    });
    if (!record) return null;
    return {
      tenderId: record.tenderId,
      lastReconciledAnalysisVersion: record.lastReconciledAnalysisVersion,
      lastReconciledDceRevision: record.lastReconciledDceRevision ?? undefined,
      reconciledByUserId: record.reconciledByUserId,
      reconciledAt: record.reconciledAt.toISOString(),
    };
  }

  async upsert(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    analysisVersion: number;
    dceRevision: number | undefined;
    reconciledByUserId: string;
    occurredAt: Date;
  }): Promise<void> {
    const data = {
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      lastReconciledAnalysisVersion: input.analysisVersion,
      lastReconciledDceRevision: input.dceRevision ?? null,
      reconciledByUserId: input.reconciledByUserId,
      reconciledAt: input.occurredAt,
    };
    await this.prisma.currentClient().tenderChecklistReconciliation.upsert({
      where: { tenderId: input.tenderId },
      create: { id: input.id, ...data },
      update: data,
    });
  }
}
