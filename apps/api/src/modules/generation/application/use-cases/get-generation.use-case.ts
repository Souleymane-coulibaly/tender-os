import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission, roleHasClientPortfolioPermission } from "../../../client-portfolio";
import { GenerationNotFoundError } from "../../domain/errors";
import { toGenerationSummary, type GenerationSummary } from "../dtos";
import { GENERATION_REPOSITORY, type GenerationRepository } from "../ports/generation.repository";

export type GetGenerationQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; generationId: string }>;

@Injectable()
export class GetGenerationUseCase {
  constructor(
    @Inject(GENERATION_REPOSITORY) private readonly generationRepository: GenerationRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetGenerationQuery): Promise<GenerationSummary> {
    const generation = await this.generationRepository.findById({ organizationId: query.organizationId, generationId: query.generationId });
    if (!generation) {
      throw new GenerationNotFoundError();
    }

    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: generation.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadGeneration,
    });

    // Coût/tokens visibles uniquement pour le palier organisation (OWNER/ADMIN) — mission §"Voir
    // routing/cost : Selon besoin" — jamais calculé ni transmis par le frontend.
    const canSeeCost = roleHasClientPortfolioPermission(query.actorRole, ClientPermission.ViewAll);

    return toGenerationSummary(generation, { canSeeCost });
  }
}
