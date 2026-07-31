import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import {
  AI_MODEL_STATUS_LABELS,
  aiModelStatusBadgeClass,
  type AiModelSummary,
  type PricingSnapshotSummary,
} from "../../../../../../lib/ai-configuration-types";
import { ApiErrorState } from "../../../api-error-state";
import { AddPricingSnapshotForm, AiModelStatusToggle } from "./ai-model-actions";

export const metadata: Metadata = { title: "Détail du modèle — TenderOS" };

function canManageAi(actorRole: string | undefined): boolean {
  return actorRole === "OWNER" || actorRole === "ORGANIZATION_ADMIN";
}

export default async function AiModelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let model: AiModelSummary;
  let pricingHistory: PricingSnapshotSummary[];
  let actorRole: string | undefined;
  try {
    [model, pricingHistory, actorRole] = await Promise.all([
      appApiFetch<AiModelSummary>(`/api/v1/ai-models/${id}`),
      appApiFetch<PricingSnapshotSummary[]>(`/api/v1/ai-models/${id}/pricing`),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageAi(actorRole);
  const currentPricing = pricingHistory.find((snapshot) => !snapshot.effectiveTo);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{model.displayName}</h1>
          <p className="text-sm text-neutral-600">
            {model.provider} · {model.modelKey}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${aiModelStatusBadgeClass(model.status)}`}>
            {AI_MODEL_STATUS_LABELS[model.status]}
          </span>
          {canManage ? <AiModelStatusToggle model={model} /> : null}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-neutral-500">Benchmark autorisé</dt>
          <dd className="font-medium">{model.enabledForBenchmark ? "Oui" : "Non"}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Production autorisée</dt>
          <dd className="font-medium">{model.enabledForProduction ? "Oui" : "Non"}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Sortie structurée</dt>
          <dd className="font-medium">{model.capabilities.supportsStructuredOutput ? "Oui" : "Non"}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Fenêtre de contexte max.</dt>
          <dd className="font-medium">{model.maxContextTokens ?? "—"}</dd>
        </div>
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Tarification</h2>
        {currentPricing ? (
          <p className="text-sm text-neutral-700">
            Tarif actif : {currentPricing.inputPricePerMillionTokens} {currentPricing.currency} / M tokens entrée ·{" "}
            {currentPricing.outputPricePerMillionTokens} {currentPricing.currency} / M tokens sortie (depuis le{" "}
            {new Date(currentPricing.effectiveFrom).toLocaleDateString("fr-FR")})
          </p>
        ) : (
          <p className="text-sm text-neutral-600">Aucun tarif actif pour ce modèle.</p>
        )}

        {pricingHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 pr-4">Entrée / M</th>
                  <th className="py-2 pr-4">Sortie / M</th>
                  <th className="py-2 pr-4">Devise</th>
                  <th className="py-2 pr-4">Du</th>
                  <th className="py-2 pr-4">Au</th>
                </tr>
              </thead>
              <tbody>
                {pricingHistory.map((snapshot) => (
                  <tr key={snapshot.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-4">{snapshot.inputPricePerMillionTokens}</td>
                    <td className="py-2 pr-4">{snapshot.outputPricePerMillionTokens}</td>
                    <td className="py-2 pr-4">{snapshot.currency}</td>
                    <td className="py-2 pr-4">{new Date(snapshot.effectiveFrom).toLocaleDateString("fr-FR")}</td>
                    <td className="py-2 pr-4">{snapshot.effectiveTo ? new Date(snapshot.effectiveTo).toLocaleDateString("fr-FR") : "Actif"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {canManage ? <AddPricingSnapshotForm modelId={model.id} /> : null}
      </section>
    </div>
  );
}
