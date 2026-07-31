import { describe, expect, it } from "vitest";
import { BenchmarkRun } from "./benchmark-run.aggregate";
import { BenchmarkRunStatus } from "./benchmark-run-status";
import { InvalidBenchmarkRunParametersError, InvalidBenchmarkRunStatusTransitionError } from "./errors";

const NOW = new Date("2026-07-30T10:00:00Z");

function createRun(overrides: Partial<Parameters<typeof BenchmarkRun.create>[0]> = {}) {
  return BenchmarkRun.create({
    id: "run-1",
    organizationId: "org-1",
    suiteId: "suite-1",
    suiteVersion: 1,
    repetitions: 3,
    concurrencyLimit: 2,
    estimatedCostAmount: "1.5",
    estimatedCostCurrency: "USD",
    launchedByUserId: "user-1",
    occurredAt: NOW,
    ...overrides,
  });
}

describe("BenchmarkRun", () => {
  it("creates PENDING", () => {
    const run = createRun();
    expect(run.status).toBe(BenchmarkRunStatus.Pending);
  });

  it("refuses repetitions outside [1,5]", () => {
    expect(() => createRun({ repetitions: 0 })).toThrow(InvalidBenchmarkRunParametersError);
    expect(() => createRun({ repetitions: 6 })).toThrow(InvalidBenchmarkRunParametersError);
  });

  it("refuses concurrencyLimit outside [1,5]", () => {
    expect(() => createRun({ concurrencyLimit: 0 })).toThrow(InvalidBenchmarkRunParametersError);
    expect(() => createRun({ concurrencyLimit: 6 })).toThrow(InvalidBenchmarkRunParametersError);
  });

  it("start() transitions PENDING -> RUNNING", () => {
    const run = createRun();
    run.start(NOW);
    expect(run.status).toBe(BenchmarkRunStatus.Running);
    expect(run.startedAt).toEqual(NOW);
  });

  it("complete() transitions RUNNING -> a terminal status", () => {
    const run = createRun();
    run.start(NOW);
    run.complete(BenchmarkRunStatus.Succeeded, NOW);
    expect(run.status).toBe(BenchmarkRunStatus.Succeeded);
  });

  it("refuses complete() from PENDING (must start() first)", () => {
    const run = createRun();
    expect(() => run.complete(BenchmarkRunStatus.Succeeded, NOW)).toThrow(InvalidBenchmarkRunStatusTransitionError);
  });

  it("requestCancel() sets a cooperative signal without changing status immediately", () => {
    const run = createRun();
    run.start(NOW);
    run.requestCancel("user-2", NOW);
    expect(run.cancelRequested).toBe(true);
    expect(run.status).toBe(BenchmarkRunStatus.Running);
  });

  it("cancel() transitions to CANCELLED", () => {
    const run = createRun();
    run.start(NOW);
    run.requestCancel("user-2", NOW);
    run.cancel(NOW);
    expect(run.status).toBe(BenchmarkRunStatus.Cancelled);
  });

  it("refuses any transition from a terminal status", () => {
    const run = createRun();
    run.start(NOW);
    run.complete(BenchmarkRunStatus.Succeeded, NOW);
    expect(() => run.cancel(NOW)).toThrow(InvalidBenchmarkRunStatusTransitionError);
  });

  describe("Audit Codex P1-3 — recoverFromStale()", () => {
    it("starts with zero stale-recovery attempts and no lastErrorCode", () => {
      const run = createRun();
      expect(run.staleRecoveryAttempts).toBe(0);
      expect(run.lastErrorCode).toBeUndefined();
    });

    it("retries (RUNNING -> PENDING) and increments the attempt counter while under the max", () => {
      const run = createRun();
      run.start(NOW);

      const outcome = run.recoverFromStale({ occurredAt: NOW, errorCode: "BENCHMARK_RUN_STALE_TIMEOUT", maxAttempts: 3 });

      expect(outcome).toBe("retried");
      expect(run.status).toBe(BenchmarkRunStatus.Pending);
      expect(run.staleRecoveryAttempts).toBe(1);
      expect(run.lastErrorCode).toBe("BENCHMARK_RUN_STALE_TIMEOUT");
    });

    it("marks FAILED once the max recovery attempts is exceeded — never an infinite retry loop", () => {
      const run = createRun();

      for (let i = 0; i < 3; i++) {
        run.start(NOW);
        const outcome = run.recoverFromStale({ occurredAt: NOW, errorCode: "BENCHMARK_RUN_STALE_TIMEOUT", maxAttempts: 3 });
        expect(outcome).toBe("retried");
        expect(run.status).toBe(BenchmarkRunStatus.Pending);
      }

      run.start(NOW);
      const finalOutcome = run.recoverFromStale({ occurredAt: NOW, errorCode: "BENCHMARK_RUN_STALE_TIMEOUT", maxAttempts: 3 });
      expect(finalOutcome).toBe("exhausted");
      expect(run.status).toBe(BenchmarkRunStatus.Failed);
      expect(run.staleRecoveryAttempts).toBe(4);
      expect(run.completedAt).toEqual(NOW);
    });

    it("refuses recoverFromStale() from a non-RUNNING status (only a RUNNING run can be stale)", () => {
      const run = createRun();
      expect(() => run.recoverFromStale({ occurredAt: NOW, errorCode: "BENCHMARK_RUN_STALE_TIMEOUT", maxAttempts: 3 })).toThrow(
        InvalidBenchmarkRunStatusTransitionError,
      );
    });
  });
});
