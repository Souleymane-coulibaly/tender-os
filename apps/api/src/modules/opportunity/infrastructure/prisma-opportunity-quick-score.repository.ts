import { Injectable } from "@nestjs/common";
import type { OpportunityQuickScore as OpportunityQuickScoreRecordModel, Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  CreateOpportunityQuickScoreInput,
  OpportunityQuickScoreRecord,
  OpportunityQuickScoreRepository,
} from "../application/ports/opportunity-quick-score.repository";

function toRecord(row: OpportunityQuickScoreRecordModel): OpportunityQuickScoreRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    opportunityId: row.opportunityId,
    scoreVersion: row.scoreVersion,
    calculationVersion: row.calculationVersion,
    requestedByUserId: row.requestedByUserId ?? undefined,
    dataSnapshot: row.dataSnapshot,
    createdAt: row.createdAt.toISOString(),
    globalScore: row.globalScore,
    confidence: row.confidence,
    complexity: row.complexity,
    categoryScores: row.categoryScores as unknown as OpportunityQuickScoreRecord["categoryScores"],
    strengths: row.strengths as unknown as OpportunityQuickScoreRecord["strengths"],
    weaknesses: row.weaknesses as unknown as OpportunityQuickScoreRecord["weaknesses"],
    blockers: row.blockers as unknown as OpportunityQuickScoreRecord["blockers"],
    missingData: row.missingData as unknown as OpportunityQuickScoreRecord["missingData"],
  };
}

@Injectable()
export class PrismaOpportunityQuickScoreRepository implements OpportunityQuickScoreRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateOpportunityQuickScoreInput): Promise<OpportunityQuickScoreRecord> {
    const created = await this.prisma.currentClient().opportunityQuickScore.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        opportunityId: input.opportunityId,
        scoreVersion: (await this.getLatestVersion({ organizationId: input.organizationId, opportunityId: input.opportunityId })) + 1,
        globalScore: input.result.globalScore,
        confidence: input.result.confidence,
        complexity: input.result.complexity,
        categoryScores: input.result.categoryScores as unknown as Prisma.InputJsonValue,
        strengths: input.result.strengths as unknown as Prisma.InputJsonValue,
        weaknesses: input.result.weaknesses as unknown as Prisma.InputJsonValue,
        blockers: input.result.blockers as unknown as Prisma.InputJsonValue,
        missingData: input.result.missingData as unknown as Prisma.InputJsonValue,
        calculationVersion: input.calculationVersion,
        dataSnapshot: input.dataSnapshot as Prisma.InputJsonValue,
        requestedByUserId: input.requestedByUserId ?? null,
        createdAt: input.createdAt,
      },
    });
    return toRecord(created);
  }

  async getLatestVersion(input: { organizationId: string; opportunityId: string }): Promise<number> {
    const latest = await this.prisma.currentClient().opportunityQuickScore.findFirst({
      where: { organizationId: input.organizationId, opportunityId: input.opportunityId },
      orderBy: { scoreVersion: "desc" },
      select: { scoreVersion: true },
    });
    return latest?.scoreVersion ?? 0;
  }

  async getLatest(input: { organizationId: string; opportunityId: string }): Promise<OpportunityQuickScoreRecord | null> {
    const latest = await this.prisma.currentClient().opportunityQuickScore.findFirst({
      where: { organizationId: input.organizationId, opportunityId: input.opportunityId },
      orderBy: { scoreVersion: "desc" },
    });
    return latest ? toRecord(latest) : null;
  }

  async listVersions(input: { organizationId: string; opportunityId: string }): Promise<OpportunityQuickScoreRecord[]> {
    const rows = await this.prisma.currentClient().opportunityQuickScore.findMany({
      where: { organizationId: input.organizationId, opportunityId: input.opportunityId },
      orderBy: { scoreVersion: "desc" },
    });
    return rows.map(toRecord);
  }
}
