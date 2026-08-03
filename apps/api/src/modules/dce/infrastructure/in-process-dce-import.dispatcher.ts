import { Inject, Injectable, Logger } from "@nestjs/common";
import type { DceImportDispatcher, DceImportDispatchInput } from "../application/ports/dce-import-dispatcher";
import { ProcessDceZipImportUseCase } from "../application/use-cases/process-dce-zip-import.use-case";

/** Adaptateur en mémoire (même motif que InProcessExtractionDispatcher/InProcessGenerationDispatcher
 *  — `setImmediate` détache l'exécution de la pile d'appel HTTP courante). Le buffer ZIP est
 *  capturé en fermeture, jamais persisté : un redémarrage du process pendant le traitement laisse
 *  le job dans un état non terminal (limite documentée, acceptable pour cette tranche). */
@Injectable()
export class InProcessDceImportDispatcher implements DceImportDispatcher {
  private readonly logger = new Logger(InProcessDceImportDispatcher.name);

  constructor(@Inject(ProcessDceZipImportUseCase) private readonly processUseCase: ProcessDceZipImportUseCase) {}

  dispatch(input: DceImportDispatchInput): void {
    setImmediate(() => {
      this.processUseCase.execute(input).catch((error: unknown) => {
        this.logger.error(
          `Unhandled error while processing DCE ZIP import job ${input.jobId}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      });
    });
  }
}
