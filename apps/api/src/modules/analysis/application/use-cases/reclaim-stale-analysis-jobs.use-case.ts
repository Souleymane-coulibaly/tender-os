import { Inject, Injectable, Logger } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AnalysisStatus } from "../../domain/analysis-status";
import { ANALYSIS_DISPATCHER, type AnalysisDispatcher } from "../ports/analysis-dispatcher";
import { ANALYSIS_JOB_REPOSITORY, type AnalysisJobRepository } from "../ports/analysis-job.repository";

export type ReclaimStaleAnalysisJobsInput = Readonly<{ staleThresholdMs: number; batchSize: number }>;
export type ReclaimStaleAnalysisJobsResult = Readonly<{ reclaimed: number }>;

/**
 * Sprint 21 (hardening) — mission PARTIE F : `InProcessAnalysisDispatcher` documente lui-même sa
 * propre limite ("un job interrompu par un crash reste PROCESSING jusqu'à un retry manuel") — ce
 * use case comble cet écart, appelé périodiquement par `AnalysisJobStaleRecoveryWorker`. Revérifie
 * l'état sous verrou (`runExclusiveForJob`) avant de muter : la liste de candidats est une lecture
 * non verrouillée, potentiellement déjà obsolète (le job a pu se terminer entre-temps).
 */
@Injectable()
export class ReclaimStaleAnalysisJobsUseCase {
  private readonly logger = new Logger(ReclaimStaleAnalysisJobsUseCase.name);

  constructor(
    @Inject(ANALYSIS_JOB_REPOSITORY) private readonly jobRepository: AnalysisJobRepository,
    @Inject(ANALYSIS_DISPATCHER) private readonly dispatcher: AnalysisDispatcher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ReclaimStaleAnalysisJobsInput): Promise<ReclaimStaleAnalysisJobsResult> {
    const now = this.clock.now();
    const olderThan = new Date(now.getTime() - input.staleThresholdMs);
    const candidates = await this.jobRepository.findStaleProcessingCandidates({ olderThan, limit: input.batchSize });

    let reclaimed = 0;
    for (const candidate of candidates) {
      try {
        const wasReclaimed = await this.jobRepository.runExclusiveForJob({
          organizationId: candidate.organizationId,
          jobId: candidate.jobId,
          fn: async (job) => {
            if (job.status !== AnalysisStatus.Processing || job.updatedAt >= olderThan) {
              return false;
            }
            job.reclaimStale(this.clock.now());
            return true;
          },
        });

        if (wasReclaimed) {
          reclaimed += 1;
          this.logger.warn(`Reclaimed stale analysis job ${candidate.jobId} (stuck PROCESSING) — re-dispatching.`);
          this.dispatcher.dispatch({ organizationId: candidate.organizationId, jobId: candidate.jobId });
        }
      } catch (error) {
        this.logger.error(
          `Failed to reclaim analysis job ${candidate.jobId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { reclaimed };
  }
}
