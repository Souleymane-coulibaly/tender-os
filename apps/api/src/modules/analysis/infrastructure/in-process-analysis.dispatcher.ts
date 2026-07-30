import { Inject, Injectable, Logger } from "@nestjs/common";
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
  private readonly logger = new Logger(InProcessAnalysisDispatcher.name);

  constructor(@Inject(ProcessAnalysisJobUseCase) private readonly processUseCase: ProcessAnalysisJobUseCase) {}

  dispatch(input: AnalysisDispatchInput): void {
    setImmediate(() => {
      this.processUseCase.execute(input).catch((error: unknown) => {
        this.logger.error(
          `Unhandled error while processing analysis job ${input.jobId}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      });
    });
  }
}
