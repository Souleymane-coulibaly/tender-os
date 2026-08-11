import { Injectable } from "@nestjs/common";
import type { GoNoGoDecision as GoNoGoDecisionModel } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  CreateGoNoGoDecisionInput,
  GoNoGoDecisionRecord,
  GoNoGoDecisionRepository,
} from "../application/ports/go-no-go-decision.repository";

function toRecord(row: GoNoGoDecisionModel): GoNoGoDecisionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    level: row.level as GoNoGoDecisionRecord["level"],
    opportunityId: row.opportunityId ?? undefined,
    tenderId: row.tenderId ?? undefined,
    linkedQuickScoreId: row.linkedQuickScoreId ?? undefined,
    linkedReportId: row.linkedReportId ?? undefined,
    decision: row.decision as GoNoGoDecisionRecord["decision"],
    justification: row.justification ?? undefined,
    conditions: row.conditions ?? undefined,
    comment: row.comment ?? undefined,
    actorId: row.actorId,
    decidedAt: row.decidedAt.toISOString(),
  };
}

@Injectable()
export class PrismaGoNoGoDecisionRepository implements GoNoGoDecisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateGoNoGoDecisionInput): Promise<GoNoGoDecisionRecord> {
    const created = await this.prisma.currentClient().goNoGoDecision.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        level: input.level,
        opportunityId: input.opportunityId ?? null,
        tenderId: input.tenderId ?? null,
        linkedQuickScoreId: input.linkedQuickScoreId ?? null,
        linkedReportId: input.linkedReportId ?? null,
        decision: input.decision,
        justification: input.justification ?? null,
        conditions: input.conditions ?? null,
        comment: input.comment ?? null,
        actorId: input.actorId,
        decidedAt: input.decidedAt,
      },
    });
    return toRecord(created);
  }

  async listByOpportunity(input: { organizationId: string; opportunityId: string }): Promise<GoNoGoDecisionRecord[]> {
    const rows = await this.prisma.currentClient().goNoGoDecision.findMany({
      where: { organizationId: input.organizationId, level: "OPPORTUNITY", opportunityId: input.opportunityId },
      orderBy: { insertSeq: "desc" },
    });
    return rows.map(toRecord);
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<GoNoGoDecisionRecord[]> {
    const rows = await this.prisma.currentClient().goNoGoDecision.findMany({
      where: { organizationId: input.organizationId, level: "TENDER", tenderId: input.tenderId },
      orderBy: { insertSeq: "desc" },
    });
    return rows.map(toRecord);
  }

  async getLatestByOpportunity(input: { organizationId: string; opportunityId: string }): Promise<GoNoGoDecisionRecord | null> {
    const row = await this.prisma.currentClient().goNoGoDecision.findFirst({
      where: { organizationId: input.organizationId, level: "OPPORTUNITY", opportunityId: input.opportunityId },
      orderBy: { insertSeq: "desc" },
    });
    return row ? toRecord(row) : null;
  }

  async getLatestByTender(input: { organizationId: string; tenderId: string }): Promise<GoNoGoDecisionRecord | null> {
    const row = await this.prisma.currentClient().goNoGoDecision.findFirst({
      where: { organizationId: input.organizationId, level: "TENDER", tenderId: input.tenderId },
      orderBy: { insertSeq: "desc" },
    });
    return row ? toRecord(row) : null;
  }

  async listRecentByTenderIds(input: { organizationId: string; tenderIds: readonly string[]; since: Date }): Promise<GoNoGoDecisionRecord[]> {
    if (input.tenderIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.currentClient().goNoGoDecision.findMany({
      where: { organizationId: input.organizationId, level: "TENDER", tenderId: { in: [...input.tenderIds] }, decidedAt: { gte: input.since } },
      orderBy: { insertSeq: "desc" },
    });
    return rows.map(toRecord);
  }
}
