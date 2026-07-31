import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { BenchmarkCaseResultRepository } from "../application/ports/benchmark-case-result.repository";
import type { BenchmarkCaseResult } from "../domain/benchmark-case-result.entity";
import { toDomain, toPersistence } from "./benchmark-case-result.persistence-mapper";

@Injectable()
export class PrismaBenchmarkCaseResultRepository implements BenchmarkCaseResultRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(result: BenchmarkCaseResult): Promise<void> {
    await this.prisma.benchmarkCaseResult.create({ data: toPersistence(result) });
  }

  async listByRun(input: { runId: string }): Promise<readonly BenchmarkCaseResult[]> {
    const records = await this.prisma.benchmarkCaseResult.findMany({ where: { runId: input.runId } });
    return records.map(toDomain);
  }
}
