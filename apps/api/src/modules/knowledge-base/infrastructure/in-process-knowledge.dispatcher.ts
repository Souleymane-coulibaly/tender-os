import { Inject, Injectable } from "@nestjs/common";
import { BackgroundTaskRunner } from "../../../shared-kernel/background-task-runner";
import type { KnowledgeDispatcher, KnowledgeDocumentDispatchInput } from "../application/ports/knowledge-dispatcher";
import { ProcessKnowledgeDocumentUseCase } from "../application/use-cases/process-knowledge-document.use-case";

/**
 * Adaptateur en mémoire (même motif que `InProcessAnalysisDispatcher`/
 * `InProcessExtractionDispatcher`) — ne survit pas à un redémarrage du process : un document
 * interrompu par un crash reste `PROCESSING` jusqu'à un relancement manuel (`reprocess`) — limite
 * documentée, acceptable pour cette tranche (mission §"Ne pas mettre en place BullMQ/RabbitMQ/
 * Kafka/SQS sauf nécessité déjà présente").
 */
@Injectable()
export class InProcessKnowledgeDispatcher implements KnowledgeDispatcher {
  constructor(@Inject(ProcessKnowledgeDocumentUseCase) private readonly processUseCase: ProcessKnowledgeDocumentUseCase, private readonly backgroundTasks: BackgroundTaskRunner) {}

  dispatch(input: KnowledgeDocumentDispatchInput): void {
    // Checkpoint TENDEROS-2.1-P2.3-E12.3 — passe par `BackgroundTaskRunner` : le travail
    // detache est desormais SUIVI, refuse apres le debut de l'arret, et attendu par
    // `onModuleDestroy` avant la deconnexion Prisma. Voir le contrat complet dans ce service.
    this.backgroundTasks.run(`knowledge-document:${input.knowledgeDocumentId}`, () => this.processUseCase.execute(input));
  }
}
