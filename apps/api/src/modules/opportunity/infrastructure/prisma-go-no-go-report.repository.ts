import { Injectable } from "@nestjs/common";
import type { GoNoGoReport as GoNoGoReportModel, Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  CreateGoNoGoReportInput,
  GoNoGoReportRecord,
  GoNoGoReportRepository,
} from "../application/ports/go-no-go-report.repository";

function toRecord(row: GoNoGoReportModel): GoNoGoReportRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    tenderId: row.tenderId,
    reportVersion: row.reportVersion,
    analysisVersion: row.analysisVersion,
    calculationVersion: row.calculationVersion,
    requestedByUserId: row.requestedByUserId ?? undefined,
    generatedAt: row.generatedAt.toISOString(),
    globalScore: row.globalScore,
    confidence: row.confidence,
    complexity: row.complexity,
    documentaryLoad: row.documentaryLoad as GoNoGoReportRecord["documentaryLoad"],
    estimatedPrepTime: row.estimatedPrepTime as unknown as GoNoGoReportRecord["estimatedPrepTime"],
    categoryScores: row.categoryScores as unknown as GoNoGoReportRecord["categoryScores"],
    positiveCauses: row.positiveCauses as unknown as GoNoGoReportRecord["positiveCauses"],
    negativeCauses: row.negativeCauses as unknown as GoNoGoReportRecord["negativeCauses"],
    risks: row.risks as unknown as GoNoGoReportRecord["risks"],
    blockers: row.blockers as unknown as GoNoGoReportRecord["blockers"],
    missingInfo: row.missingInfo as unknown as GoNoGoReportRecord["missingInfo"],
    subcontractingFlags: row.subcontractingFlags as unknown as GoNoGoReportRecord["subcontractingFlags"],
    recommendation: row.recommendation as GoNoGoReportRecord["recommendation"],
    recommendationRationale: row.recommendationRationale,
  };
}

@Injectable()
export class PrismaGoNoGoReportRepository implements GoNoGoReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateGoNoGoReportInput): Promise<GoNoGoReportRecord> {
    const created = await this.prisma.currentClient().goNoGoReport.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        reportVersion: (await this.getLatestVersion({ organizationId: input.organizationId, tenderId: input.tenderId })) + 1,
        analysisVersion: input.analysisVersion,
        globalScore: input.result.globalScore,
        confidence: input.result.confidence,
        complexity: input.result.complexity,
        documentaryLoad: input.result.documentaryLoad,
        estimatedPrepTime: input.result.estimatedPrepTime as unknown as Prisma.InputJsonValue,
        categoryScores: input.result.categoryScores as unknown as Prisma.InputJsonValue,
        positiveCauses: input.result.positiveCauses as unknown as Prisma.InputJsonValue,
        negativeCauses: input.result.negativeCauses as unknown as Prisma.InputJsonValue,
        risks: input.result.risks as unknown as Prisma.InputJsonValue,
        blockers: input.result.blockers as unknown as Prisma.InputJsonValue,
        missingInfo: input.result.missingInfo as unknown as Prisma.InputJsonValue,
        subcontractingFlags: input.result.subcontractingFlags as unknown as Prisma.InputJsonValue,
        recommendation: input.result.recommendation,
        recommendationRationale: input.result.recommendationRationale,
        calculationVersion: input.calculationVersion,
        requestedByUserId: input.requestedByUserId ?? null,
        generatedAt: input.generatedAt,
      },
    });
    return toRecord(created);
  }

  async getLatestVersion(input: { organizationId: string; tenderId: string }): Promise<number> {
    const latest = await this.prisma.currentClient().goNoGoReport.findFirst({
      where: { organizationId: input.organizationId, tenderId: input.tenderId },
      orderBy: { reportVersion: "desc" },
      select: { reportVersion: true },
    });
    return latest?.reportVersion ?? 0;
  }

  async getLatest(input: { organizationId: string; tenderId: string }): Promise<GoNoGoReportRecord | null> {
    const latest = await this.prisma.currentClient().goNoGoReport.findFirst({
      where: { organizationId: input.organizationId, tenderId: input.tenderId },
      orderBy: { reportVersion: "desc" },
    });
    return latest ? toRecord(latest) : null;
  }

  async listVersions(input: { organizationId: string; tenderId: string }): Promise<GoNoGoReportRecord[]> {
    const rows = await this.prisma.currentClient().goNoGoReport.findMany({
      where: { organizationId: input.organizationId, tenderId: input.tenderId },
      orderBy: { reportVersion: "desc" },
    });
    return rows.map(toRecord);
  }

  async findById(input: { organizationId: string; tenderId: string; reportId: string }): Promise<GoNoGoReportRecord | null> {
    const row = await this.prisma.currentClient().goNoGoReport.findFirst({
      where: { id: input.reportId, organizationId: input.organizationId, tenderId: input.tenderId },
    });
    return row ? toRecord(row) : null;
  }
}
