import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission, roleHasClientPortfolioPermission } from "../../../client-portfolio";
import { GenerationNotFoundError } from "../../domain/errors";
import { toGenerationSummary, type GenerationSummary } from "../dtos";
import { GENERATION_REPOSITORY, type GenerationRepository } from "../ports/generation.repository";

export type CompareGenerationVersionsQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  fromGenerationId: string;
  toGenerationId: string;
}>;

export type CompareGenerationVersionsResult = Readonly<{ from: GenerationSummary; to: GenerationSummary }>;

/** Retourne les deux versions complètes — jamais un diff calculé côté backend (mission §"le
 *  frontend rend la comparaison"). Les deux ids doivent appartenir au MÊME fil (même
 *  `rootGenerationId`), sinon refusé explicitement (jamais une comparaison entre deux tenders
 *  différents par erreur d'id). */
@Injectable()
export class CompareGenerationVersionsUseCase {
  constructor(
    @Inject(GENERATION_REPOSITORY) private readonly generationRepository: GenerationRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: CompareGenerationVersionsQuery): Promise<CompareGenerationVersionsResult> {
    const [from, to] = await Promise.all([
      this.generationRepository.findById({ organizationId: query.organizationId, generationId: query.fromGenerationId }),
      this.generationRepository.findById({ organizationId: query.organizationId, generationId: query.toGenerationId }),
    ]);
    if (!from || !to || from.rootGenerationId !== to.rootGenerationId) {
      throw new GenerationNotFoundError();
    }

    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: from.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadGeneration,
    });

    const canSeeCost = roleHasClientPortfolioPermission(query.actorRole, ClientPermission.ViewAll);
    return { from: toGenerationSummary(from, { canSeeCost }), to: toGenerationSummary(to, { canSeeCost }) };
  }
}
