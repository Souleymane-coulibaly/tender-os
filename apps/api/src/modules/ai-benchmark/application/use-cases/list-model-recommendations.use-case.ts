import { Inject, Injectable } from "@nestjs/common";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toModelRecommendationSummary, type ModelRecommendationSummary } from "../dtos";
import { MODEL_RECOMMENDATION_REPOSITORY, type ModelRecommendationRepository } from "../ports/model-recommendation.repository";

export type ListModelRecommendationsQuery = Readonly<{ organizationId: string; actorRole: string }>;

@Injectable()
export class ListModelRecommendationsUseCase {
  constructor(@Inject(MODEL_RECOMMENDATION_REPOSITORY) private readonly modelRecommendationRepository: ModelRecommendationRepository) {}

  async execute(query: ListModelRecommendationsQuery): Promise<readonly ModelRecommendationSummary[]> {
    assertHasAiBenchmarkPermission(query.actorRole, AiBenchmarkPermission.ReadRecommendations);
    const recommendations = await this.modelRecommendationRepository.list({ organizationId: query.organizationId });
    return recommendations.map(toModelRecommendationSummary);
  }
}
