import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { BenchmarkSuiteRepository } from "../application/ports/benchmark-suite.repository";
import type { BenchmarkSuite } from "../domain/benchmark-suite.aggregate";
import { toDomain, toPersistence } from "./benchmark-suite.persistence-mapper";

@Injectable()
export class PrismaBenchmarkSuiteRepository implements BenchmarkSuiteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { id: string }): Promise<BenchmarkSuite | null> {
    const record = await this.prisma.benchmarkSuite.findUnique({ where: { id: input.id } });
    return record ? toDomain(record) : null;
  }

  async findLatestVersionByName(input: { name: string }): Promise<BenchmarkSuite | null> {
    const record = await this.prisma.benchmarkSuite.findFirst({
      where: { name: input.name },
      orderBy: { version: "desc" },
    });
    return record ? toDomain(record) : null;
  }

  async list(): Promise<readonly BenchmarkSuite[]> {
    const records = await this.prisma.benchmarkSuite.findMany({ orderBy: [{ name: "asc" }, { version: "desc" }] });
    return records.map(toDomain);
  }

  async create(suite: BenchmarkSuite): Promise<void> {
    await this.prisma.benchmarkSuite.create({ data: toPersistence(suite) });
  }

  async save(suite: BenchmarkSuite): Promise<void> {
    await this.prisma.benchmarkSuite.update({ where: { id: suite.id }, data: toPersistence(suite) });
  }
}
