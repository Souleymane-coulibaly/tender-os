import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GenerationNotFoundError } from "../../domain/errors";
import { toGenerationSummary, type GenerationSummary } from "../dtos";
import { GENERATION_DISPATCHER, type GenerationDispatcher } from "../ports/generation-dispatcher";
import { GENERATION_REPOSITORY, type GenerationRepository } from "../ports/generation.repository";

export type RetryGenerationCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  generationId: string;
  requestId?: string | undefined;
}>;

/** Réutilise la MÊME ligne/version — jamais une nouvelle version (distinct de
 *  `RegenerateGenerationUseCase`, voir mission §"Régénération contrôlée" vs §"régénère"). */
@Injectable()
export class RetryGenerationUseCase {
  constructor(
    @Inject(GENERATION_REPOSITORY) private readonly generationRepository: GenerationRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(GENERATION_DISPATCHER) private readonly dispatcher: GenerationDispatcher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RetryGenerationCommand): Promise<GenerationSummary> {
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
      permission: ClientPermission.ManageGeneration,
    });

    generation.resetForRetry();
    await this.generationRepository.save(generation);

    this.dispatcher.dispatch({ organizationId: command.organizationId, generationId: generation.id, requestId: command.requestId });

    return toGenerationSummary(generation, { canSeeCost: false });
  }
}
