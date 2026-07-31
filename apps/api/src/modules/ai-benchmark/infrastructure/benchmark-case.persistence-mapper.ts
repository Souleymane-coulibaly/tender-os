import type { BenchmarkCase as BenchmarkCaseRecord, Prisma } from "@prisma/client";
import { BenchmarkCase } from "../domain/benchmark-case.entity";
import type { BenchmarkBusinessCategory, BenchmarkDifficulty, BenchmarkLanguage } from "../domain/benchmark-difficulty";

export function toDomain(record: BenchmarkCaseRecord): BenchmarkCase {
  return BenchmarkCase.rehydrate({
    id: record.id,
    suiteId: record.suiteId,
    inputVariables: record.inputVariables as Record<string, string>,
    expectedOutput: record.expectedOutput,
    expectedProvenance: record.expectedProvenance ?? undefined,
    difficulty: record.difficulty as BenchmarkDifficulty,
    language: record.language as BenchmarkLanguage,
    businessCategory: (record.businessCategory as BenchmarkBusinessCategory | null) ?? undefined,
    createdAt: record.createdAt,
  });
}

export function toPersistence(benchmarkCase: BenchmarkCase) {
  return {
    id: benchmarkCase.id,
    suiteId: benchmarkCase.suiteId,
    inputVariables: benchmarkCase.inputVariables as Prisma.InputJsonValue,
    expectedOutput: benchmarkCase.expectedOutput as Prisma.InputJsonValue,
    expectedProvenance: (benchmarkCase.expectedProvenance ?? null) as Prisma.InputJsonValue,
    difficulty: benchmarkCase.difficulty,
    language: benchmarkCase.language,
    businessCategory: benchmarkCase.businessCategory ?? null,
    createdAt: benchmarkCase.createdAt,
  };
}
