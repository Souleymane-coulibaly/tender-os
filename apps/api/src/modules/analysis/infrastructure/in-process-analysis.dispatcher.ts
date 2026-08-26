import { Inject, Injectable } from "@nestjs/common";
import { BackgroundTaskRunner } from "../../../shared-kernel/background-task-runner";
import type { AnalysisDispatcher, AnalysisDispatchInput } from "../application/ports/analysis-dispatcher";
import { ProcessAnalysisJobUseCase } from "../application/use-cases/process-analysis-job.use-case";

/**
 * Adaptateur en mémoire (mission §"Une implémentation in-process est acceptable pour le Sprint
 * 4.1... elle pourra être remplacée par une file externe plus tard") — même motif que
 * `InProcessExtractionDispatcher` (module Extraction, Sprint 3). Ne survit pas à un redémarrage du
 * process : un job interrompu par un crash reste `PROCESSING` jusqu'à un retry manuel — limite
 * documentée (voir rapport final §L "risques résiduels"), acceptable pour cette tranche.
 */
@Injectable()
export class InProcessAnalysisDispatcher implements AnalysisDispatcher {
  constructor(@Inject(ProcessAnalysisJobUseCase) private readonly processUseCase: ProcessAnalysisJobUseCase, private readonly backgroundTasks: BackgroundTaskRunner) {}

  dispatch(input: AnalysisDispatchInput): void {
    // Checkpoint TENDEROS-2.1-P2.3-E12.3 — passe par `BackgroundTaskRunner` : le travail
    // detache est desormais SUIVI, refuse apres le debut de l'arret, et attendu par
    // `onModuleDestroy` avant la deconnexion Prisma. Voir le contrat complet dans ce service.
    this.backgroundTasks.run(`analysis-job:${input.jobId}`, () => this.processUseCase.execute(input));
  }
}
