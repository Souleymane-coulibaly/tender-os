import type { BenchmarkRun } from "../../domain/benchmark-run.aggregate";
import type { BenchmarkRunModel } from "../../domain/benchmark-run-model.entity";

export interface BenchmarkRunRepository {
  findById(input: { organizationId: string; runId: string }): Promise<BenchmarkRun | null>;
  list(input: { organizationId: string }): Promise<readonly BenchmarkRun[]>;
  /** Audit Codex P1-3 — runs RUNNING dont `updatedAt` n'a plus progressé depuis
   *  `updatedBefore` (crash/redéploiement présumé), toutes organisations confondues (sweep de
   *  fond, jamais scoped à une organisation). */
  listStaleRunning(input: { updatedBefore: Date }): Promise<readonly BenchmarkRun[]>;
  /** Crée le run et sa sélection de modèles dans la même transaction courte — un run n'existe
   *  jamais sans au moins un `BenchmarkRunModel` associé (mission §"sélectionner plusieurs modèles
   *  autorisés"). */
  createWithModels(run: BenchmarkRun, runModels: readonly BenchmarkRunModel[]): Promise<void>;
  save(run: BenchmarkRun): Promise<void>;
  listRunModels(input: { runId: string }): Promise<readonly BenchmarkRunModel[]>;
}

export const BENCHMARK_RUN_REPOSITORY = Symbol("BENCHMARK_RUN_REPOSITORY");
