import { Inject, Injectable } from "@nestjs/common";
import { BackgroundTaskRunner } from "../../../shared-kernel/background-task-runner";
import type { ExtractionDispatcher, ExtractionDispatchInput } from "../application/ports/extraction-dispatcher";
import { ProcessDocumentExtractionUseCase } from "../application/use-cases/process-document-extraction.use-case";

/**
 * Adaptateur en mémoire (mission Sprint 3 §15 "jamais une architecture distribuée non nécessaire")
 * — `setImmediate` détache l'exécution de la pile d'appel HTTP courante sans introduire de file
 * d'attente externe. Ne survit pas à un redémarrage du process : un job interrompu par un crash
 * reste `PROCESSING` jusqu'à un retry manuel (limite documentée, acceptable pour cette tranche,
 * voir rapport final §J "risques résiduels").
 */
@Injectable()
export class InProcessExtractionDispatcher implements ExtractionDispatcher {
  constructor(
    @Inject(ProcessDocumentExtractionUseCase) private readonly processUseCase: ProcessDocumentExtractionUseCase,
    private readonly backgroundTasks: BackgroundTaskRunner,
  ) {}

  dispatch(input: ExtractionDispatchInput): void {
    // Checkpoint TENDEROS-2.1-P2.3-E12.3 — passe par `BackgroundTaskRunner` : le travail
    // detache est desormais SUIVI, refuse apres le debut de l'arret, et attendu par
    // `onModuleDestroy` avant la deconnexion Prisma. Voir le contrat complet dans ce service.
    this.backgroundTasks.run(`extraction:${input.documentId}`, () => this.processUseCase.execute(input));
  }
}
