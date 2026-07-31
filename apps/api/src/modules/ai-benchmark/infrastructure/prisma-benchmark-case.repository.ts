import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { BenchmarkCaseRepository } from "../application/ports/benchmark-case.repository";
import type { BenchmarkCase } from "../domain/benchmark-case.entity";
import { toDomain, toPersistence } from "./benchmark-case.persistence-mapper";

@Injectable()
export class PrismaBenchmarkCaseRepository implements BenchmarkCaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { id: string }): Promise<BenchmarkCase | null> {
    const record = await this.prisma.benchmarkCase.findUnique({ where: { id: input.id } });
    return record ? toDomain(record) : null;
  }

  async listBySuite(input: { suiteId: string }): Promise<readonly BenchmarkCase[]> {
    const records = await this.prisma.benchmarkCase.findMany({
      where: { suiteId: input.suiteId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toDomain);
  }

  async countBySuite(input: { suiteId: string }): Promise<number> {
    return this.prisma.benchmarkCase.count({ where: { suiteId: input.suiteId } });
  }

  async create(benchmarkCase: BenchmarkCase): Promise<void> {
    await this.prisma.benchmarkCase.create({ data: toPersistence(benchmarkCase) });
  }
}
