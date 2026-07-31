import { beforeEach, describe, expect, it } from "vitest";
import { BenchmarkRun } from "../../domain/benchmark-run.aggregate";
import { BenchmarkRunStatus } from "../../domain/benchmark-run-status";
import {
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryBenchmarkRunRepository,
  RecordingBenchmarkRunDispatcher,
  TEST_AI_BENCHMARK_CONFIG,
} from "../../test-support/fakes";
import { RecoverStaleBenchmarkRunsUseCase } from "./recover-stale-benchmark-runs.use-case";

const NOW = new Date("2026-07-31T12:00:00Z");

describe("RecoverStaleBenchmarkRunsUseCase — audit Codex P1-3", () => {
  let benchmarkRunRepository: InMemoryBenchmarkRunRepository;
  let dispatcher: RecordingBenchmarkRunDispatcher;
  let clock: FixedClock;
  let useCase: RecoverStaleBenchmarkRunsUseCase;

  beforeEach(() => {
    benchmarkRunRepository = new InMemoryBenchmarkRunRepository();
    dispatcher = new RecordingBenchmarkRunDispatcher();
    clock = new FixedClock(NOW);
    useCase = new RecoverStaleBenchmarkRunsUseCase(
      benchmarkRunRepository,
      dispatcher,
      new InMemoryAuditLogWriter(),
      TEST_AI_BENCHMARK_CONFIG,
      clock,
    );
  });

  function makeStaleRunningRun(input: { id: string; staleSinceMs: number }): BenchmarkRun {
    const launchedAt = new Date(NOW.getTime() - input.staleSinceMs - 60_000);
    const run = BenchmarkRun.create({
      id: input.id,
      organizationId: "org-1",
      suiteId: "suite-1",
      suiteVersion: 1,
      repetitions: 1,
      concurrencyLimit: 1,
      estimatedCostAmount: "1",
      estimatedCostCurrency: "USD",
      launchedByUserId: "user-1",
      occurredAt: launchedAt,
    });
    run.start(new Date(NOW.getTime() - input.staleSinceMs));
    return run;
  }

  it("detects a run stuck RUNNING past the stale timeout, retries it (RUNNING -> PENDING), and redispatches it", async () => {
    const staleRun = makeStaleRunningRun({ id: "run-stale", staleSinceMs: TEST_AI_BENCHMARK_CONFIG.staleRunTimeoutMs + 60_000 });
    await benchmarkRunRepository.createWithModels(staleRun, []);

    const result = await useCase.execute();

    expect(result.retried).toBe(1);
    expect(result.exhausted).toBe(0);

    const reloaded = await benchmarkRunRepository.findById({ organizationId: "org-1", runId: "run-stale" });
    expect(reloaded!.status).toBe(BenchmarkRunStatus.Pending);
    expect(reloaded!.staleRecoveryAttempts).toBe(1);
    expect(reloaded!.lastErrorCode).toBe("BENCHMARK_RUN_STALE_TIMEOUT");

    expect(dispatcher.dispatched).toHaveLength(1);
    expect(dispatcher.dispatched[0]?.runId).toBe("run-stale");
  });

  it("never touches a RUNNING run that is still fresh (updatedAt recent)", async () => {
    const freshRun = makeStaleRunningRun({ id: "run-fresh", staleSinceMs: 1000 });
    await benchmarkRunRepository.createWithModels(freshRun, []);

    const result = await useCase.execute();

    expect(result.retried).toBe(0);
    expect(result.exhausted).toBe(0);
    expect(dispatcher.dispatched).toHaveLength(0);

    const reloaded = await benchmarkRunRepository.findById({ organizationId: "org-1", runId: "run-fresh" });
    expect(reloaded!.status).toBe(BenchmarkRunStatus.Running);
  });

  it("never touches a run that is already in a terminal or PENDING status", async () => {
    const pendingRun = BenchmarkRun.create({
      id: "run-pending",
      organizationId: "org-1",
      suiteId: "suite-1",
      suiteVersion: 1,
      repetitions: 1,
      concurrencyLimit: 1,
      estimatedCostAmount: "1",
      estimatedCostCurrency: "USD",
      launchedByUserId: "user-1",
      occurredAt: new Date(NOW.getTime() - 999_999_999),
    });
    await benchmarkRunRepository.createWithModels(pendingRun, []);

    const result = await useCase.execute();
    expect(result.retried).toBe(0);
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it("marks FAILED (never retried again) once a run has already exhausted its stale-recovery attempts", async () => {
    const exhaustedRun = makeStaleRunningRun({ id: "run-exhausted", staleSinceMs: TEST_AI_BENCHMARK_CONFIG.staleRunTimeoutMs + 60_000 });
    // Simule 3 reprises déjà consommées lors de sweeps précédents (déjà RUNNING une fois via
    // makeStaleRunningRun — seules les répétitions suivantes ont besoin d'un start() explicite).
    for (let i = 0; i < TEST_AI_BENCHMARK_CONFIG.maxStaleRecoveryAttempts; i++) {
      exhaustedRun.recoverFromStale({
        occurredAt: NOW,
        errorCode: "BENCHMARK_RUN_STALE_TIMEOUT",
        maxAttempts: TEST_AI_BENCHMARK_CONFIG.maxStaleRecoveryAttempts,
      });
      exhaustedRun.start(new Date(NOW.getTime() - TEST_AI_BENCHMARK_CONFIG.staleRunTimeoutMs - 60_000));
    }
    await benchmarkRunRepository.createWithModels(exhaustedRun, []);

    const result = await useCase.execute();

    expect(result.retried).toBe(0);
    expect(result.exhausted).toBe(1);
    expect(dispatcher.dispatched).toHaveLength(0);

    const reloaded = await benchmarkRunRepository.findById({ organizationId: "org-1", runId: "run-exhausted" });
    expect(reloaded!.status).toBe(BenchmarkRunStatus.Failed);
  });

  it("processes multiple stale runs independently: one recovery failure never blocks the others", async () => {
    const run1 = makeStaleRunningRun({ id: "run-1", staleSinceMs: TEST_AI_BENCHMARK_CONFIG.staleRunTimeoutMs + 1000 });
    const run2 = makeStaleRunningRun({ id: "run-2", staleSinceMs: TEST_AI_BENCHMARK_CONFIG.staleRunTimeoutMs + 1000 });
    await benchmarkRunRepository.createWithModels(run1, []);
    await benchmarkRunRepository.createWithModels(run2, []);

    const result = await useCase.execute();

    expect(result.retried).toBe(2);
    expect(dispatcher.dispatched).toHaveLength(2);
  });
});
