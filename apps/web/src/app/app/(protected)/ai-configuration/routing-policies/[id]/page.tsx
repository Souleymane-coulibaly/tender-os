import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import {
  ESCALATION_CONDITION_LABELS,
  PROMPT_KEY_LABELS,
  ROUTING_POLICY_STATUS_LABELS,
  type AiModelSummary,
  type RoutingPolicySummary,
} from "../../../../../../lib/ai-configuration-types";
import { ApiErrorState } from "../../../api-error-state";
import { RoutingPolicyLifecycleButtons } from "./routing-policy-actions";

export const metadata: Metadata = { title: "Politique de routage — TenderOS" };

function canManageAi(actorRole: string | undefined): boolean {
  return actorRole === "OWNER" || actorRole === "ORGANIZATION_ADMIN";
}

function routingPolicyStatusBadgeClass(status: RoutingPolicySummary["status"]): string {
  switch (status) {
    case "ACTIVE":
      return "bg-green-100 text-green-800";
    case "ARCHIVED":
      return "bg-neutral-200 text-neutral-700";
    default:
      return "bg-blue-100 text-blue-800";
  }
}

export default async function RoutingPolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let policy: RoutingPolicySummary;
  let models: AiModelSummary[];
  let actorRole: string | undefined;
  try {
    [policy, models, actorRole] = await Promise.all([
      appApiFetch<RoutingPolicySummary>(`/api/v1/ai-benchmark/routing-policies/${id}`),
      appApiFetch<AiModelSummary[]>("/api/v1/ai-models"),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageAi(actorRole);
  const modelById = new Map(models.map((model) => [model.id, model]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            {PROMPT_KEY_LABELS[policy.promptKey]} <span className="text-neutral-500">· v{policy.version}</span>
          </h1>
          <p className="text-sm text-neutral-600">Créée par l&apos;utilisateur {policy.authorUserId}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${routingPolicyStatusBadgeClass(policy.status)}`}>
            {ROUTING_POLICY_STATUS_LABELS[policy.status]}
          </span>
          {canManage ? <RoutingPolicyLifecycleButtons policyId={policy.id} status={policy.status} /> : null}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-neutral-500">Modèle principal</dt>
          <dd className="font-medium">{modelById.get(policy.primaryAiModelId)?.displayName ?? policy.primaryAiModelId}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Modèle d&apos;escalade</dt>
          <dd className="font-medium">
            {policy.escalationAiModelId ? modelById.get(policy.escalationAiModelId)?.displayName ?? policy.escalationAiModelId : "Aucun"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Délai maximal</dt>
          <dd className="font-medium">{policy.timeoutMs} ms</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Tentatives max.</dt>
          <dd className="font-medium">{policy.maxRetries}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Provenance requise</dt>
          <dd className="font-medium">{policy.provenanceRequired ? "Oui" : "Non"}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Effective depuis</dt>
          <dd className="font-medium">{policy.effectiveFrom ? new Date(policy.effectiveFrom).toLocaleString("fr-FR") : "—"}</dd>
        </div>
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Déclencheurs d&apos;escalade</h2>
        {policy.escalationConditions.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun déclencheur configuré : jamais d&apos;escalade.</p>
        ) : (
          <ul className="list-inside list-disc text-sm text-neutral-700">
            {policy.escalationConditions.map((condition) => (
              <li key={condition}>{ESCALATION_CONDITION_LABELS[condition as keyof typeof ESCALATION_CONDITION_LABELS] ?? condition}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
