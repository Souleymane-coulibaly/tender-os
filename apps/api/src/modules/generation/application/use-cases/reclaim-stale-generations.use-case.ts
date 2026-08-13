import { Inject, Injectable, Logger } from "@nestjs/common";
import { GenerationStatus } from "../../domain/generation-status";
import { GENERATION_DISPATCHER, type GenerationDispatcher } from "../ports/generation-dispatcher";
import { GENERATION_REPOSITORY, type GenerationRepository } from "../ports/generation.repository";

export type ReclaimStaleGenerationsInput = Readonly<{ staleThresholdMs: number; batchSize: number }>;
export type ReclaimStaleGenerationsResult = Readonly<{ reclaimed: number }>;

/**
 * Sprint 21 (hardening) — mission PARTIE F, même motif que `ReclaimStaleAnalysisJobsUseCase` :
 * `InProcessGenerationDispatcher` documente lui-même sa limite ("une génération interrompue par un
 * crash reste GENERATING jusqu'à un retry manuel"). Contrairement à AnalysisJob (verrou consultatif
 * via `runExclusiveForJob`), Generation ne possède aucune primitive de verrouillage par ligne.
 *
 * Correctif (réaudit externe) — la première version de ce use case lisait la génération
 * (`findById`) puis la mutait via `save()` (écriture INCONDITIONNELLE par id seul, jamais un
 * compare-and-set). Si le worker réel (`ProcessGenerationUseCase.finalizeGeneration`, qui LUI utilise
 * bien un `updateMany` conditionnel sur `status`+`attemptCount`) finalisait la génération DANS la
 * fenêtre entre cette lecture et cette écriture, la reprise stale écrasait silencieusement un
 * résultat déjà acquis (GENERATED/FAILED) en le repassant à PENDING — une régression de cohérence
 * réelle, jamais seulement théorique : c'est précisément le scénario qu'un mécanisme de reprise
 * stale doit trancher correctement. `reclaimStaleGenerating` applique désormais le MÊME
 * compare-and-set que `finalizeGeneration` (`status: GENERATING` + `attemptCount` attendu) — un
 * résultat plus récent que celui lu ici ne peut plus jamais être écrasé.
 */
@Injectable()
export class ReclaimStaleGenerationsUseCase {
  private readonly logger = new Logger(ReclaimStaleGenerationsUseCase.name);

  constructor(
    @Inject(GENERATION_REPOSITORY) private readonly generationRepository: GenerationRepository,
    @Inject(GENERATION_DISPATCHER) private readonly dispatcher: GenerationDispatcher,
  ) {}

  async execute(input: ReclaimStaleGenerationsInput): Promise<ReclaimStaleGenerationsResult> {
    const olderThan = new Date(Date.now() - input.staleThresholdMs);
    const candidates = await this.generationRepository.findStaleGeneratingCandidates({ olderThan, limit: input.batchSize });

    let reclaimed = 0;
    for (const candidate of candidates) {
      try {
        const generation = await this.generationRepository.findById(candidate);
        if (!generation || generation.status !== GenerationStatus.Generating) {
          continue;
        }
        // Jamais de mutation de cet objet lu (`generation.reclaimStale()`) : ce n'est qu'une copie
        // de lecture destinée à fournir `attemptCount` au compare-and-set ci-dessous, qui reste la
        // SEULE autorité réelle de la transition (WHERE `status = GENERATING` côté SQL). Muter
        // cette copie ici n'apporterait aucune validation supplémentaire (le statut vient d'être
        // vérifié juste au-dessus) et risquerait de fausser un futur appelant qui réutiliserait cet
        // objet en le croyant encore le reflet de la base.
        const { applied } = await this.generationRepository.reclaimStaleGenerating({
          organizationId: candidate.organizationId,
          generationId: candidate.generationId,
          expectedAttemptCount: generation.attemptCount,
        });
        if (!applied) {
          // Le worker réel a fini (ou une autre instance a déjà réclamé) entre la lecture et cette
          // écriture — jamais une régression, un no-op silencieux est le comportement correct.
          this.logger.debug(`Skipping reclaim for generation ${candidate.generationId}: state changed since it was read (already finalized elsewhere).`);
          continue;
        }

        reclaimed += 1;
        this.logger.warn(`Reclaimed stale generation ${candidate.generationId} (stuck GENERATING) — re-dispatching.`);
        this.dispatcher.dispatch({ organizationId: candidate.organizationId, generationId: candidate.generationId });
      } catch (error) {
        this.logger.error(
          `Failed to reclaim generation ${candidate.generationId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { reclaimed };
  }
}
