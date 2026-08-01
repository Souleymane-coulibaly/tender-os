import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GenerationNotFoundError } from "../../domain/errors";
import { toGenerationSummary, type GenerationSummary } from "../dtos";
import { assertCanRejectGeneration } from "../policies/generation-reject.policy";
import { GENERATION_REPOSITORY, type GenerationRepository } from "../ports/generation.repository";

export type RejectGenerationCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  generationId: string;
  reason?: string | undefined;
}>;

/**
 * Correctif Sprint 6 (réaudit Codex P1 — "le rejet d'une génération est absent") — même structure
 * que `ValidateGenerationUseCase` : `findById` scope déjà tenant (jamais une génération d'une autre
 * organisation), `AssertClientAccessUseCase` interdit tout acteur non affecté au client propriétaire
 * (cross-client), `assertCanRejectGeneration` applique la "règle simple" (voir
 * `generation-reject.policy.ts`), et `Generation.reject()` refuse tout statut incompatible
 * (FAILED/PENDING/GENERATING/CANCELLED/déjà VALIDÉE).
 */
@Injectable()
export class RejectGenerationUseCase {
  constructor(
    @Inject(GENERATION_REPOSITORY) private readonly generationRepository: GenerationRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RejectGenerationCommand): Promise<GenerationSummary> {
    const generation = await this.generationRepository.findById({
      organizationId: command.organizationId,
      generationId: command.generationId,
    });
    if (!generation) {
      throw new GenerationNotFoundError();
    }

    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: generation.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ValidateGeneration,
    });

    assertCanRejectGeneration(
      { actorId: command.actorId, actorRole: command.actorRole, generation },
      ClientPermission.ValidateGeneration,
    );

    generation.reject({ rejectedBy: command.actorId, reason: command.reason }, this.clock.now());
    await this.generationRepository.save(generation);

    return toGenerationSummary(generation, { canSeeCost: false });
  }
}
