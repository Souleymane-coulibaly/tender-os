import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  GenerationCostFilter,
  GenerationCostListResult,
  GenerationCostReader,
  GenerationCostRow,
} from "../application/ports/generation-cost-reader";

/**
 * Lit directement la table `generations` (partagée au niveau du schéma Prisma) — jamais un import
 * des ports internes du module `generation` (même motif que `PrismaRoutingDecisionWriter`,
 * Sprint 5.2, lisant `Tender.clientAccountId` directement : une lecture dénormalisée en lecture
 * seule ne justifie pas un port cross-module dédié). Ne modifie JAMAIS une ligne `Generation` —
 * Pricing est un pur consommateur en lecture du coût technique déjà figé par Sprint 6.
 */
@Injectable()
export class PrismaGenerationCostReader implements GenerationCostReader {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: GenerationCostFilter): Promise<GenerationCostListResult> {
    const where = {
      organizationId: filter.organizationId,
      ...(filter.tenderId ? { tenderId: filter.tenderId } : {}),
      ...(filter.clientAccountId ? { clientAccountId: filter.clientAccountId } : {}),
      ...(filter.taskType ? { taskType: filter.taskType } : {}),
      ...(filter.from || filter.to
        ? { createdAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } }
        : {}),
    };

    const [records, total] = await Promise.all([
      this.prisma.generation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: filter.limit ?? 1000,
        skip: filter.offset ?? 0,
      }),
      this.prisma.generation.count({ where }),
    ]);

    return { items: records.map(toRow), total };
  }

  async findById(input: { organizationId: string; generationId: string }): Promise<GenerationCostRow | null> {
    const record = await this.prisma.generation.findFirst({ where: { id: input.generationId, organizationId: input.organizationId } });
    return record ? toRow(record) : null;
  }

  async averageTokensForTaskType(input: {
    organizationId: string;
    taskType: string;
  }): Promise<{ averageInputTokens: number; averageOutputTokens: number; sampleSize: number } | null> {
    const aggregate = await this.prisma.generation.aggregate({
      where: { organizationId: input.organizationId, taskType: input.taskType, status: "GENERATED" },
      _avg: { inputTokenCount: true, outputTokenCount: true },
      _count: { _all: true },
    });

    if (aggregate._count._all === 0 || aggregate._avg.inputTokenCount === null) {
      return null;
    }

    return {
      averageInputTokens: Math.round(aggregate._avg.inputTokenCount ?? 0),
      averageOutputTokens: Math.round(aggregate._avg.outputTokenCount ?? 0),
      sampleSize: aggregate._count._all,
    };
  }
}

function toRow(record: {
  id: string;
  clientAccountId: string;
  tenderId: string;
  taskType: string;
  status: string;
  modelProvider: string | null;
  modelKey: string | null;
  fallbackLevel: number;
  inputTokenCount: number | null;
  outputTokenCount: number | null;
  totalTokenCount: number | null;
  estimatedCostAmount: { toString(): string } | null;
  currency: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): GenerationCostRow {
  return {
    generationId: record.id,
    clientAccountId: record.clientAccountId,
    tenderId: record.tenderId,
    taskType: record.taskType,
    status: record.status,
    modelProvider: record.modelProvider ?? undefined,
    modelKey: record.modelKey ?? undefined,
    fallbackLevel: record.fallbackLevel,
    inputTokenCount: record.inputTokenCount ?? undefined,
    outputTokenCount: record.outputTokenCount ?? undefined,
    totalTokenCount: record.totalTokenCount ?? undefined,
    costAmount: record.estimatedCostAmount ? record.estimatedCostAmount.toString() : undefined,
    currency: record.currency ?? undefined,
    createdAt: record.createdAt,
    completedAt: record.completedAt ?? undefined,
  };
}
