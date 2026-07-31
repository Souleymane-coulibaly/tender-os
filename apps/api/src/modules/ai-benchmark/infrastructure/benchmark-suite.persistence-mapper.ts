import type { BenchmarkSuite as BenchmarkSuiteRecord } from "@prisma/client";
import { BenchmarkSuite } from "../domain/benchmark-suite.aggregate";
import type { BenchmarkSuiteStatus } from "../domain/benchmark-suite-status";
import type { PromptKey } from "../../analysis";

export function toDomain(record: BenchmarkSuiteRecord): BenchmarkSuite {
  return BenchmarkSuite.rehydrate({
    id: record.id,
    name: record.name,
    version: record.version,
    promptKey: record.promptKey as PromptKey,
    status: record.status as BenchmarkSuiteStatus,
    description: record.description ?? undefined,
    createdByUserId: record.createdByUserId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toPersistence(suite: BenchmarkSuite) {
  return {
    id: suite.id,
    name: suite.name,
    version: suite.version,
    promptKey: suite.promptKey,
    status: suite.status,
    description: suite.description ?? null,
    createdByUserId: suite.createdByUserId,
    createdAt: suite.createdAt,
    updatedAt: suite.updatedAt,
  };
}
