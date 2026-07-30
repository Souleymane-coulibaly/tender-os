import { Inject, Injectable, Logger } from "@nestjs/common";
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
  private readonly logger = new Logger(InProcessKnowledgeDispatcher.name);

  constructor(@Inject(ProcessKnowledgeDocumentUseCase) private readonly processUseCase: ProcessKnowledgeDocumentUseCase) {}

  dispatch(input: KnowledgeDocumentDispatchInput): void {
    setImmediate(() => {
      this.processUseCase.execute(input).catch((error: unknown) => {
        this.logger.error(
          `Unhandled error while processing knowledge document ${input.knowledgeDocumentId}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      });
    });
  }
}
