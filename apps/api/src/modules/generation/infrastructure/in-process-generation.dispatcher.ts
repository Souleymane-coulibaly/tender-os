import { Inject, Injectable } from "@nestjs/common";
import { BackgroundTaskRunner } from "../../../shared-kernel/background-task-runner";
import type { GenerationDispatcher, GenerationDispatchInput } from "../application/ports/generation-dispatcher";
import { ProcessGenerationUseCase } from "../application/use-cases/process-generation.use-case";

/** Adaptateur en mémoire — même motif qu'`InProcessAnalysisDispatcher` (Sprint 4.1). Ne survit pas
 *  à un redémarrage du process : une génération interrompue par un crash reste `GENERATING` jusqu'à
 *  un retry manuel — limite documentée (voir rapport final §Q "risques résiduels"). */
@Injectable()
export class InProcessGenerationDispatcher implements GenerationDispatcher {
  constructor(@Inject(ProcessGenerationUseCase) private readonly processUseCase: ProcessGenerationUseCase, private readonly backgroundTasks: BackgroundTaskRunner) {}

  dispatch(input: GenerationDispatchInput): void {
    // Checkpoint TENDEROS-2.1-P2.3-E12.3 — passe par `BackgroundTaskRunner` : le travail
    // detache est desormais SUIVI, refuse apres le debut de l'arret, et attendu par
    // `onModuleDestroy` avant la deconnexion Prisma. Voir le contrat complet dans ce service.
    this.backgroundTasks.run(`generation:${input.generationId}`, () => this.processUseCase.execute(input));
  }
}
