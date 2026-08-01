import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission, roleHasClientPortfolioPermission } from "../../../client-portfolio";
import { GenerationNotFoundError } from "../../domain/errors";
import { toGenerationSummary, type GenerationSummary } from "../dtos";
import { GENERATION_REPOSITORY, type GenerationRepository } from "../ports/generation.repository";

export type ListGenerationVersionsQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; generationId: string }>;

/** `generationId` peut être n'importe quelle version du fil — retourne toujours TOUTES les versions
 *  (mission §"consultation des versions"). */
@Injectable()
export class ListGenerationVersionsUseCase {
  constructor(
    @Inject(GENERATION_REPOSITORY) private readonly generationRepository: GenerationRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListGenerationVersionsQuery): Promise<readonly GenerationSummary[]> {
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

    const canSeeCost = roleHasClientPortfolioPermission(query.actorRole, ClientPermission.ViewAll);
    const versions = await this.generationRepository.findByRoot({
      organizationId: query.organizationId,
      rootGenerationId: generation.rootGenerationId,
    });

    return versions.map((v) => toGenerationSummary(v, { canSeeCost }));
  }
}
