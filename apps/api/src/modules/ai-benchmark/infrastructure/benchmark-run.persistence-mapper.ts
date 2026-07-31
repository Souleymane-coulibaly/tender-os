import type { BenchmarkRun as BenchmarkRunRecord } from "@prisma/client";
import { BenchmarkRun } from "../domain/benchmark-run.aggregate";
import type { BenchmarkRunStatus } from "../domain/benchmark-run-status";

export function toDomain(record: BenchmarkRunRecord): BenchmarkRun {
  return BenchmarkRun.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    suiteId: record.suiteId,
    suiteVersion: record.suiteVersion,
    status: record.status as BenchmarkRunStatus,
    repetitions: record.repetitions,
    concurrencyLimit: record.concurrencyLimit,
    estimatedCostAmount: record.estimatedCostAmount.toString(),
    estimatedCostCurrency: record.estimatedCostCurrency,
    costCeilingAmount: record.costCeilingAmount?.toString(),
    launchedByUserId: record.launchedByUserId,
    launchedAt: record.launchedAt,
    startedAt: record.startedAt ?? undefined,
    completedAt: record.completedAt ?? undefined,
    cancelRequestedAt: record.cancelRequestedAt ?? undefined,
    cancelledByUserId: record.cancelledByUserId ?? undefined,
    lastErrorCode: record.lastErrorCode ?? undefined,
    staleRecoveryAttempts: record.staleRecoveryAttempts,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toPersistence(run: BenchmarkRun) {
  return {
    id: run.id,
    organizationId: run.organizationId,
    suiteId: run.suiteId,
    suiteVersion: run.suiteVersion,
    status: run.status,
    repetitions: run.repetitions,
    concurrencyLimit: run.concurrencyLimit,
    estimatedCostAmount: run.estimatedCostAmount,
    estimatedCostCurrency: run.estimatedCostCurrency,
    costCeilingAmount: run.costCeilingAmount ?? null,
    launchedByUserId: run.launchedByUserId,
    launchedAt: run.launchedAt,
    startedAt: run.startedAt ?? null,
    completedAt: run.completedAt ?? null,
    cancelRequestedAt: run.cancelRequestedAt ?? null,
    cancelledByUserId: run.cancelledByUserId ?? null,
    lastErrorCode: run.lastErrorCode ?? null,
    staleRecoveryAttempts: run.staleRecoveryAttempts,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}
