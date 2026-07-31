import { Inject, Injectable } from "@nestjs/common";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { ModelRecommendationNotFoundError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toModelRecommendationSummary, type ModelRecommendationSummary } from "../dtos";
import { MODEL_RECOMMENDATION_REPOSITORY, type ModelRecommendationRepository } from "../ports/model-recommendation.repository";

export type GetModelRecommendationQuery = Readonly<{ organizationId: string; actorRole: string; recommendationId: string }>;

@Injectable()
export class GetModelRecommendationUseCase {
  constructor(@Inject(MODEL_RECOMMENDATION_REPOSITORY) private readonly modelRecommendationRepository: ModelRecommendationRepository) {}

  async execute(query: GetModelRecommendationQuery): Promise<ModelRecommendationSummary> {
    assertHasAiBenchmarkPermission(query.actorRole, AiBenchmarkPermission.ReadRecommendations);

    const recommendation = await this.modelRecommendationRepository.findById({
      organizationId: query.organizationId,
      recommendationId: query.recommendationId,
    });
    if (!recommendation) {
      throw new ModelRecommendationNotFoundError();
    }

    return toModelRecommendationSummary(recommendation);
  }
}
