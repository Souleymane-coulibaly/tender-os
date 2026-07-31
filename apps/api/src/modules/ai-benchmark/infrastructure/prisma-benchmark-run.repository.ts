import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { BenchmarkRunRepository } from "../application/ports/benchmark-run.repository";
import { BenchmarkRunModel } from "../domain/benchmark-run-model.entity";
import type { BenchmarkRun } from "../domain/benchmark-run.aggregate";
import { toDomain as toRunDomain, toPersistence as toRunPersistence } from "./benchmark-run.persistence-mapper";

@Injectable()
export class PrismaBenchmarkRunRepository implements BenchmarkRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; runId: string }): Promise<BenchmarkRun | null> {
    const record = await this.prisma.benchmarkRun.findFirst({ where: { id: input.runId, organizationId: input.organizationId } });
    return record ? toRunDomain(record) : null;
  }

  async list(input: { organizationId: string }): Promise<readonly BenchmarkRun[]> {
    const records = await this.prisma.benchmarkRun.findMany({
      where: { organizationId: input.organizationId },
      orderBy: { launchedAt: "desc" },
    });
    return records.map(toRunDomain);
  }

  async listStaleRunning(input: { updatedBefore: Date }): Promise<readonly BenchmarkRun[]> {
    const records = await this.prisma.benchmarkRun.findMany({
      where: { status: "RUNNING", updatedAt: { lt: input.updatedBefore } },
    });
    return records.map(toRunDomain);
  }

  async createWithModels(run: BenchmarkRun, runModels: readonly BenchmarkRunModel[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.benchmarkRun.create({ data: toRunPersistence(run) });
      await tx.benchmarkRunModel.createMany({
        data: runModels.map((rm) => ({
          id: rm.id,
          runId: rm.runId,
          aiModelId: rm.aiModelId,
          pricingSnapshotId: rm.pricingSnapshotId,
          pricingCurrency: rm.pricingCurrency,
          pricingInputPricePerMillionTokens: rm.pricingInputPricePerMillionTokens,
          pricingOutputPricePerMillionTokens: rm.pricingOutputPricePerMillionTokens,
          pricingCachedInputPricePerMillionTokens: rm.pricingCachedInputPricePerMillionTokens ?? null,
          pricingEffectiveFrom: rm.pricingEffectiveFrom,
          pricingSource: rm.pricingSource,
          createdAt: rm.createdAt,
        })),
      });
    });
  }

  async save(run: BenchmarkRun): Promise<void> {
    await this.prisma.benchmarkRun.update({ where: { id: run.id }, data: toRunPersistence(run) });
  }

  async listRunModels(input: { runId: string }): Promise<readonly BenchmarkRunModel[]> {
    const records = await this.prisma.benchmarkRunModel.findMany({ where: { runId: input.runId } });
    return records.map((record) =>
      BenchmarkRunModel.rehydrate({
        id: record.id,
        runId: record.runId,
        aiModelId: record.aiModelId,
        pricingSnapshotId: record.pricingSnapshotId,
        pricingCurrency: record.pricingCurrency,
        pricingInputPricePerMillionTokens: record.pricingInputPricePerMillionTokens.toString(),
        pricingOutputPricePerMillionTokens: record.pricingOutputPricePerMillionTokens.toString(),
        pricingCachedInputPricePerMillionTokens: record.pricingCachedInputPricePerMillionTokens?.toString(),
        pricingEffectiveFrom: record.pricingEffectiveFrom,
        pricingSource: record.pricingSource,
        createdAt: record.createdAt,
      }),
    );
  }
}
