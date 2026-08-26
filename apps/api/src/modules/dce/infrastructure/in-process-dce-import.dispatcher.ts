import { Inject, Injectable } from "@nestjs/common";
import { BackgroundTaskRunner } from "../../../shared-kernel/background-task-runner";
import type { DceImportDispatcher, DceImportDispatchInput } from "../application/ports/dce-import-dispatcher";
import { ProcessDceZipImportUseCase } from "../application/use-cases/process-dce-zip-import.use-case";

/** Adaptateur en mémoire (même motif que InProcessExtractionDispatcher/InProcessGenerationDispatcher
 *  — `setImmediate` détache l'exécution de la pile d'appel HTTP courante). Le buffer ZIP est
 *  capturé en fermeture, jamais persisté : un redémarrage du process pendant le traitement laisse
 *  le job dans un état non terminal (limite documentée, acceptable pour cette tranche). */
@Injectable()
export class InProcessDceImportDispatcher implements DceImportDispatcher {
  constructor(@Inject(ProcessDceZipImportUseCase) private readonly processUseCase: ProcessDceZipImportUseCase, private readonly backgroundTasks: BackgroundTaskRunner) {}

  dispatch(input: DceImportDispatchInput): void {
    // Checkpoint TENDEROS-2.1-P2.3-E12.3 — passe par `BackgroundTaskRunner` : le travail
    // detache est desormais SUIVI, refuse apres le debut de l'arret, et attendu par
    // `onModuleDestroy` avant la deconnexion Prisma. Voir le contrat complet dans ce service.
    this.backgroundTasks.run(`dce-zip-import:${input.jobId}`, () => this.processUseCase.execute(input));
  }
}
