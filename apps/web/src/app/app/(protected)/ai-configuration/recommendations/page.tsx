import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import {
  MODEL_RECOMMENDATION_STATUS_LABELS,
  PROMPT_KEY_LABELS,
  type AiModelSummary,
  type ModelRecommendationSummary,
} from "../../../../../lib/ai-configuration-types";
import { isOrganizationAdmin } from "../../../../../lib/authorization";
import { ApiErrorState } from "../../api-error-state";
import { RecommendationDecisionButtons } from "./recommendation-actions";

export const metadata: Metadata = { title: "Configuration IA — Recommandations — TenderOS" };

// Checkpoint TENDEROS-2.1-P2.3-E6 — palier OWNER/ORGANIZATION_ADMIN converge vers lib/authorization.ts.
const canManageAi = isOrganizationAdmin;

function recommendationStatusBadgeClass(status: ModelRecommendationSummary["status"]): string {
  switch (status) {
    case "APPROVED":
      return "bg-green-100 text-green-800";
    case "REJECTED":
      return "bg-red-100 text-red-800";
    default:
      return "bg-blue-100 text-blue-800";
  }
}

export default async function ModelRecommendationsPage() {
  let recommendations: ModelRecommendationSummary[];
  let models: AiModelSummary[];
  let actorRole: string | undefined;
  try {
    [recommendations, models, actorRole] = await Promise.all([
      appApiFetch<ModelRecommendationSummary[]>("/api/v1/ai-benchmark/recommendations"),
      appApiFetch<AiModelSummary[]>("/api/v1/ai-models"),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageAi(actorRole);
  const modelById = new Map(models.map((model) => [model.id, model]));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Recommandations de modèles</h1>
        <p className="text-sm text-neutral-600">
          Générées à partir des résultats de benchmark. Une recommandation n&apos;est jamais activée automatiquement : elle
          doit être approuvée avant de pouvoir servir de base à une politique de routage.
        </p>
      </div>

      {recommendations.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucune recommandation pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {recommendations.map((recommendation) => {
            const primaryModel = modelById.get(recommendation.primaryAiModelId);
            const escalationModel = recommendation.escalationAiModelId ? modelById.get(recommendation.escalationAiModelId) : undefined;
            return (
              <li key={recommendation.id} className="rounded border border-neutral-200 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-semibold">{PROMPT_KEY_LABELS[recommendation.promptKey]}</h2>
                    <p className="text-sm text-neutral-600">
                      Modèle principal : <span className="font-medium">{primaryModel?.displayName ?? recommendation.primaryAiModelId}</span>
                      {escalationModel ? (
                        <>
                          {" "}
                          · Escalade : <span className="font-medium">{escalationModel.displayName}</span>
                        </>
                      ) : null}
                    </p>
                    <p className="mt-1 text-sm text-neutral-600">
                      Score {recommendation.score.toFixed(3)} · Coût moyen {recommendation.avgCostAmount} {recommendation.avgCostCurrency} ·
                      Latence moyenne {Math.round(recommendation.avgLatencyMs)} ms · Confiance {(recommendation.confidence * 100).toFixed(0)}%
                    </p>
                    {recommendation.reasons.length > 0 ? (
                      <ul className="mt-2 list-inside list-disc text-sm text-neutral-700">
                        {recommendation.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    ) : null}
                    {recommendation.limitations.length > 0 ? (
                      <ul className="mt-2 list-inside list-disc text-sm text-amber-700">
                        {recommendation.limitations.map((limitation) => (
                          <li key={limitation}>{limitation}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${recommendationStatusBadgeClass(recommendation.status)}`}>
                      {MODEL_RECOMMENDATION_STATUS_LABELS[recommendation.status]}
                    </span>
                    {canManage && recommendation.status === "DRAFT" ? (
                      <RecommendationDecisionButtons recommendationId={recommendation.id} />
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
