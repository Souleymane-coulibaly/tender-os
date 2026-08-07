import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  CreateTenderAnalysisSummaryRevisionInput,
  TenderAnalysisSummaryRevisionRecord,
  TenderAnalysisSummaryRevisionRepository,
} from "../application/ports/tender-analysis-summary-revision.repository";

@Injectable()
export class PrismaTenderAnalysisSummaryRevisionRepository implements TenderAnalysisSummaryRevisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateTenderAnalysisSummaryRevisionInput): Promise<TenderAnalysisSummaryRevisionRecord> {
    const existingCount = await this.prisma.tenderAnalysisSummaryRevision.count({
      where: { organizationId: input.organizationId, baseSummaryId: input.baseSummaryId },
    });

    const created = await this.prisma.tenderAnalysisSummaryRevision.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        baseSummaryId: input.baseSummaryId,
        revisionNumber: existingCount + 1,
        opportunitySummary: input.opportunitySummary ?? null,
        complexityLevel: input.complexityLevel ?? null,
        mainCriteria: (input.mainCriteria as unknown as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        mainRisks: (input.mainRisks as unknown as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        mainObligations: (input.mainObligations as unknown as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        missingElements: (input.missingElements as unknown as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        pointsToClarify: (input.pointsToClarify as unknown as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        conflicts: (input.conflicts as unknown as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        editedByUserId: input.editedByUserId,
        editedAt: input.editedAt,
        reason: input.reason ?? null,
      },
    });

    return this.toRecord(created);
  }

  async listByBaseSummaryId(input: { organizationId: string; baseSummaryId: string }): Promise<TenderAnalysisSummaryRevisionRecord[]> {
    const records = await this.prisma.tenderAnalysisSummaryRevision.findMany({
      where: { organizationId: input.organizationId, baseSummaryId: input.baseSummaryId },
      orderBy: { revisionNumber: "desc" },
    });
    return records.map((record) => this.toRecord(record));
  }

  private toRecord(record: {
    id: string;
    organizationId: string;
    tenderId: string;
    baseSummaryId: string;
    revisionNumber: number;
    opportunitySummary: string | null;
    complexityLevel: string | null;
    mainCriteria: unknown;
    mainRisks: unknown;
    mainObligations: unknown;
    missingElements: unknown;
    pointsToClarify: unknown;
    conflicts: unknown;
    editedByUserId: string;
    editedAt: Date;
    reason: string | null;
  }): TenderAnalysisSummaryRevisionRecord {
    return {
      id: record.id,
      organizationId: record.organizationId,
      tenderId: record.tenderId,
      baseSummaryId: record.baseSummaryId,
      revisionNumber: record.revisionNumber,
      opportunitySummary: record.opportunitySummary ?? undefined,
      complexityLevel: record.complexityLevel ?? undefined,
      mainCriteria: (record.mainCriteria as string[] | null) ?? undefined,
      mainRisks: (record.mainRisks as string[] | null) ?? undefined,
      mainObligations: (record.mainObligations as string[] | null) ?? undefined,
      missingElements: (record.missingElements as string[] | null) ?? undefined,
      pointsToClarify: (record.pointsToClarify as string[] | null) ?? undefined,
      conflicts: record.conflicts ?? undefined,
      editedByUserId: record.editedByUserId,
      editedAt: record.editedAt.toISOString(),
      reason: record.reason ?? undefined,
    };
  }
}
