import type { ModelRecommendation } from "../../domain/model-recommendation.aggregate";

export interface ModelRecommendationRepository {
  findById(input: { organizationId: string; recommendationId: string }): Promise<ModelRecommendation | null>;
  list(input: { organizationId: string }): Promise<readonly ModelRecommendation[]>;
  create(recommendation: ModelRecommendation): Promise<void>;
  save(recommendation: ModelRecommendation): Promise<void>;
}

export const MODEL_RECOMMENDATION_REPOSITORY = Symbol("MODEL_RECOMMENDATION_REPOSITORY");
