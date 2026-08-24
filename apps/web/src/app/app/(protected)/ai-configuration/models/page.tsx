import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import { AI_MODEL_STATUS_LABELS, aiModelStatusBadgeClass, type AiModelSummary } from "../../../../../lib/ai-configuration-types";
import { isOrganizationAdmin } from "../../../../../lib/authorization";
import { ApiErrorState } from "../../api-error-state";

export const metadata: Metadata = { title: "Configuration IA — Modèles — TenderOS" };

// Checkpoint TENDEROS-2.1-P2.3-E6 — palier OWNER/ORGANIZATION_ADMIN converge vers lib/authorization.ts.
const canManageAi = isOrganizationAdmin;

export default async function AiModelsListPage() {
  let models: AiModelSummary[];
  let actorRole: string | undefined;
  try {
    [models, actorRole] = await Promise.all([
      appApiFetch<AiModelSummary[]>("/api/v1/ai-models"),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageAi(actorRole);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Modèles IA</h1>
          <p className="text-sm text-neutral-600">
            Registre des modèles autorisés à être benchmarkés ou utilisés en production. Aucun modèle en dehors de cette
            liste ne peut être appelé par TenderOS.
          </p>
        </div>
        {canManage ? (
          <Link href="/app/ai-configuration/models/new" className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
            Enregistrer un modèle
          </Link>
        ) : null}
      </div>

      {models.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun modèle enregistré pour l&apos;instant.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Nom</th>
                <th className="py-2 pr-4">Fournisseur</th>
                <th className="py-2 pr-4">Identifiant modèle</th>
                <th className="py-2 pr-4">Statut</th>
                <th className="py-2 pr-4">Benchmark</th>
                <th className="py-2 pr-4">Production</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4">
                    <Link href={`/app/ai-configuration/models/${model.id}`} className="font-medium text-neutral-900 hover:underline">
                      {model.displayName}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{model.provider}</td>
                  <td className="py-2 pr-4 text-neutral-600">{model.modelKey}</td>
                  <td className="py-2 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${aiModelStatusBadgeClass(model.status)}`}>
                      {AI_MODEL_STATUS_LABELS[model.status]}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{model.enabledForBenchmark ? "Oui" : "Non"}</td>
                  <td className="py-2 pr-4 text-neutral-600">{model.enabledForProduction ? "Oui" : "Non"}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/app/ai-configuration/models/${model.id}`} className="text-neutral-700 hover:underline">
                      Ouvrir
                    </Link>
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
