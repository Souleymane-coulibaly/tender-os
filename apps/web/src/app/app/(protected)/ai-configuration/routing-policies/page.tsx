import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import {
  PROMPT_KEY_LABELS,
  ROUTING_POLICY_STATUS_LABELS,
  type AiModelSummary,
  type RoutingPolicySummary,
} from "../../../../../lib/ai-configuration-types";
import { ApiErrorState } from "../../api-error-state";

export const metadata: Metadata = { title: "Configuration IA — Routing — TenderOS" };

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

export default async function RoutingPoliciesListPage() {
  let policies: RoutingPolicySummary[];
  let models: AiModelSummary[];
  let actorRole: string | undefined;
  try {
    [policies, models, actorRole] = await Promise.all([
      appApiFetch<RoutingPolicySummary[]>("/api/v1/ai-benchmark/routing-policies"),
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Politiques de routage</h1>
          <p className="text-sm text-neutral-600">
            Détermine quel modèle traite réellement chaque tâche IA. Une seule politique peut être active à la fois par tâche.
          </p>
        </div>
        {canManage ? (
          <Link
            href="/app/ai-configuration/routing-policies/new"
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Nouvelle politique
          </Link>
        ) : null}
      </div>

      {policies.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucune politique de routage pour l&apos;instant.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Tâche</th>
                <th className="py-2 pr-4">Version</th>
                <th className="py-2 pr-4">Modèle principal</th>
                <th className="py-2 pr-4">Escalade</th>
                <th className="py-2 pr-4">Statut</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4">
                    <Link href={`/app/ai-configuration/routing-policies/${policy.id}`} className="font-medium text-neutral-900 hover:underline">
                      {PROMPT_KEY_LABELS[policy.promptKey]}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">v{policy.version}</td>
                  <td className="py-2 pr-4 text-neutral-600">{modelById.get(policy.primaryAiModelId)?.displayName ?? policy.primaryAiModelId}</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {policy.escalationAiModelId ? modelById.get(policy.escalationAiModelId)?.displayName ?? policy.escalationAiModelId : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${routingPolicyStatusBadgeClass(policy.status)}`}>
                      {ROUTING_POLICY_STATUS_LABELS[policy.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
