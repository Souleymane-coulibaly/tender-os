import { Inject, Injectable } from "@nestjs/common";
import { BackgroundTaskRunner } from "../../../shared-kernel/background-task-runner";
import type { BenchmarkRunDispatcher, BenchmarkRunDispatchInput } from "../application/ports/benchmark-run-dispatcher";
import { ExecuteBenchmarkRunUseCase } from "../application/use-cases/execute-benchmark-run.use-case";

/** Adaptateur en mémoire — même motif que `InProcessAnalysisDispatcher` (mission Sprint 4.1) :
 *  acceptable pour cette tranche, ne survit pas à un redémarrage du process (un run interrompu par
 *  un crash reste RUNNING jusqu'à une reprise manuelle — limite documentée). */
@Injectable()
export class InProcessBenchmarkRunDispatcher implements BenchmarkRunDispatcher {
  constructor(@Inject(ExecuteBenchmarkRunUseCase) private readonly executeUseCase: ExecuteBenchmarkRunUseCase, private readonly backgroundTasks: BackgroundTaskRunner) {}

  dispatch(input: BenchmarkRunDispatchInput): void {
    // Checkpoint TENDEROS-2.1-P2.3-E12.3 — passe par `BackgroundTaskRunner` : le travail
    // detache est desormais SUIVI, refuse apres le debut de l'arret, et attendu par
    // `onModuleDestroy` avant la deconnexion Prisma. Voir le contrat complet dans ce service.
    this.backgroundTasks.run(`benchmark-run:${input.runId}`, () => this.executeUseCase.execute(input));
  }
}
