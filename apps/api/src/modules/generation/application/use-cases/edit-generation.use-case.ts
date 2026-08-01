import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GenerationNotFoundError } from "../../domain/errors";
import { toGenerationSummary, type GenerationSummary } from "../dtos";
import { GENERATION_REPOSITORY, type GenerationRepository } from "../ports/generation.repository";

export type EditGenerationCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  generationId: string;
  editedContent?: string | undefined;
  editedStructuredContent?: unknown;
}>;

/** Contenu édité distinct du contenu généré — jamais un mélange silencieux (mission §"Édition
 *  humaine", "Ne mélange pas silencieusement contenu IA et contenu humain"). */
@Injectable()
export class EditGenerationUseCase {
  constructor(
    @Inject(GENERATION_REPOSITORY) private readonly generationRepository: GenerationRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: EditGenerationCommand): Promise<GenerationSummary> {
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

    generation.applyEdit(
      { editedBy: command.actorId, editedContent: command.editedContent, editedStructuredContent: command.editedStructuredContent },
      this.clock.now(),
    );
    await this.generationRepository.save(generation);

    return toGenerationSummary(generation, { canSeeCost: false });
  }
}
