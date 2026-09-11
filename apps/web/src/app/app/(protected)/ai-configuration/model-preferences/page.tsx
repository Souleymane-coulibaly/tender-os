import type { Metadata } from "next";
import { fetchAiModelPreferences } from "../../../ai-routing-actions";
import { CONFIGURABLE_AI_FEATURES } from "../../../../../lib/ai-routing-types";
import { ApiErrorState } from "../../api-error-state";
import { AiPreferenceRow } from "./ai-preference-row";

export const metadata: Metadata = { title: "Configuration IA — Choix des modèles — TenderOS" };

/**
 * Checkpoint TENDEROS-2.1-P2.3-E4, mission §16 — choix du modèle par fonctionnalité. AUTOMATIC est
 * déjà le comportement par défaut sans aucune visite de cette page (mission §15 "aucune étape IA
 * supplémentaire obligatoire") — cette page ne fait qu'exposer un choix explicite optionnel.
 * Ancienne entrée de menu « IA / Modèles » (`/app/ai-preferences`, qui redirige ici) : fusionnée
 * dans Configuration IA, pour une seule entrée IA dans les Paramètres.
 */
export default async function AiModelPreferencesPage() {
  let preferences: Awaited<ReturnType<typeof fetchAiModelPreferences>>;
  try {
    preferences = await fetchAiModelPreferences();
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const byTaskType = new Map(preferences.map((p) => [p.taskType, p]));

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Choix des modèles</h1>
        <p className="mt-1 text-sm text-neutral-600">
          TenderOS choisit automatiquement le meilleur modèle selon la nature de chaque tâche. Vous pouvez modifier ce choix pour les
          fonctionnalités ci-dessous, lorsque c&apos;est possible.
        </p>
      </div>

      <div className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {CONFIGURABLE_AI_FEATURES.map((feature) => {
          const preference = byTaskType.get(feature.taskType);
          if (!preference) return null;
          return <AiPreferenceRow key={feature.taskType} label={feature.label} preference={preference} />;
        })}
      </div>
    </div>
  );
}
