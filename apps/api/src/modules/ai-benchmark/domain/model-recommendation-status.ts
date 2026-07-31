export const ModelRecommendationStatus = {
  Draft: "DRAFT",
  Approved: "APPROVED",
  Rejected: "REJECTED",
} as const;

export type ModelRecommendationStatus = (typeof ModelRecommendationStatus)[keyof typeof ModelRecommendationStatus];
