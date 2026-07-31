export const BenchmarkRunStatus = {
  Pending: "PENDING",
  Running: "RUNNING",
  Succeeded: "SUCCEEDED",
  PartiallySucceeded: "PARTIALLY_SUCCEEDED",
  Failed: "FAILED",
  Cancelled: "CANCELLED",
} as const;

export type BenchmarkRunStatus = (typeof BenchmarkRunStatus)[keyof typeof BenchmarkRunStatus];

/** Même discipline que `analysis-status.ts` — une table de transitions explicite, jamais une
 *  mutation de statut implicite. */
export const ALLOWED_BENCHMARK_RUN_TRANSITIONS: Record<BenchmarkRunStatus, readonly BenchmarkRunStatus[]> = {
  [BenchmarkRunStatus.Pending]: [BenchmarkRunStatus.Running, BenchmarkRunStatus.Cancelled],
  [BenchmarkRunStatus.Running]: [
    BenchmarkRunStatus.Succeeded,
    BenchmarkRunStatus.PartiallySucceeded,
    BenchmarkRunStatus.Failed,
    BenchmarkRunStatus.Cancelled,
    // Audit Codex P1-3 — remise en PENDING pour un retry contrôlé après détection d'un run "stale"
    // (RUNNING dont `updatedAt` n'a plus progressé depuis le seuil configuré, crash/redéploiement
    // présumé) — jamais une transition directe RUNNING → PENDING hors de ce chemin de récupération.
    BenchmarkRunStatus.Pending,
  ],
  [BenchmarkRunStatus.Succeeded]: [],
  [BenchmarkRunStatus.PartiallySucceeded]: [],
  [BenchmarkRunStatus.Failed]: [],
  [BenchmarkRunStatus.Cancelled]: [],
};

export function isTerminalBenchmarkRunStatus(status: BenchmarkRunStatus): boolean {
  return ALLOWED_BENCHMARK_RUN_TRANSITIONS[status].length === 0;
}
