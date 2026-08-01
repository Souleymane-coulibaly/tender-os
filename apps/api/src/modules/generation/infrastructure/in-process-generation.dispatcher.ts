import { Inject, Injectable, Logger } from "@nestjs/common";
import type { GenerationDispatcher, GenerationDispatchInput } from "../application/ports/generation-dispatcher";
import { ProcessGenerationUseCase } from "../application/use-cases/process-generation.use-case";

/** Adaptateur en mémoire — même motif qu'`InProcessAnalysisDispatcher` (Sprint 4.1). Ne survit pas
 *  à un redémarrage du process : une génération interrompue par un crash reste `GENERATING` jusqu'à
 *  un retry manuel — limite documentée (voir rapport final §Q "risques résiduels"). */
@Injectable()
export class InProcessGenerationDispatcher implements GenerationDispatcher {
  private readonly logger = new Logger(InProcessGenerationDispatcher.name);

  constructor(@Inject(ProcessGenerationUseCase) private readonly processUseCase: ProcessGenerationUseCase) {}

  dispatch(input: GenerationDispatchInput): void {
    setImmediate(() => {
      this.processUseCase.execute(input).catch((error: unknown) => {
        this.logger.error(
          `Unhandled error while processing generation ${input.generationId}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      });
    });
  }
}
