import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GenerationNotFoundError } from "../../domain/errors";
import { toGenerationSummary, type GenerationSummary } from "../dtos";
import { assertCanValidateGeneration } from "../policies/generation-validate.policy";
import { GENERATION_REPOSITORY, type GenerationRepository } from "../ports/generation.repository";

export type ValidateGenerationCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  generationId: string;
}>;

/** Traçable — mission §"Validation". "Règle simple" : voir `generation-validate.policy.ts`. */
@Injectable()
export class ValidateGenerationUseCase {
  constructor(
    @Inject(GENERATION_REPOSITORY) private readonly generationRepository: GenerationRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ValidateGenerationCommand): Promise<GenerationSummary> {
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

    assertCanValidateGeneration(
      { actorId: command.actorId, actorRole: command.actorRole, generation },
      ClientPermission.ValidateGeneration,
    );

    generation.validate({ validatedBy: command.actorId }, this.clock.now());
    await this.generationRepository.save(generation);

    return toGenerationSummary(generation, { canSeeCost: false });
  }
}
