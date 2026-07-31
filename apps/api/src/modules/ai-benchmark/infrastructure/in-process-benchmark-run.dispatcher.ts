import { Inject, Injectable, Logger } from "@nestjs/common";
import type { BenchmarkRunDispatcher, BenchmarkRunDispatchInput } from "../application/ports/benchmark-run-dispatcher";
import { ExecuteBenchmarkRunUseCase } from "../application/use-cases/execute-benchmark-run.use-case";

/** Adaptateur en mémoire — même motif que `InProcessAnalysisDispatcher` (mission Sprint 4.1) :
 *  acceptable pour cette tranche, ne survit pas à un redémarrage du process (un run interrompu par
 *  un crash reste RUNNING jusqu'à une reprise manuelle — limite documentée). */
@Injectable()
export class InProcessBenchmarkRunDispatcher implements BenchmarkRunDispatcher {
  private readonly logger = new Logger(InProcessBenchmarkRunDispatcher.name);

  constructor(@Inject(ExecuteBenchmarkRunUseCase) private readonly executeUseCase: ExecuteBenchmarkRunUseCase) {}

  dispatch(input: BenchmarkRunDispatchInput): void {
    setImmediate(() => {
      this.executeUseCase.execute(input).catch((error: unknown) => {
        this.logger.error(
          `Unhandled error while executing benchmark run ${input.runId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    });
  }
}
