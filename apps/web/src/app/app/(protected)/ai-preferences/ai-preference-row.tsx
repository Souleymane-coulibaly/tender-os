"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetAiModelPreferenceAction, setAiModelPreferenceAction } from "../../ai-routing-actions";
import { AI_ROUTING_MODEL_LABELS, type AiModelPreferenceSummary, type AiRoutingModelId } from "../../../../lib/ai-routing-types";

const AUTOMATIC_VALUE = "AUTOMATIC";

/** Mission §16/§17 — un select par fonctionnalité : "Automatique — recommandé" + les modèles
 *  compatibles (mission §12 — jamais un modèle incompatible proposé). */
export function AiPreferenceRow({ label, preference }: { label: string; preference: AiModelPreferenceSummary }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    startTransition(async () => {
      if (value === AUTOMATIC_VALUE) {
        await resetAiModelPreferenceAction(preference.taskType);
      } else {
        await setAiModelPreferenceAction(preference.taskType, value as AiRoutingModelId);
      }
      router.refresh();
    });
  }

  const defaultLabel = AI_ROUTING_MODEL_LABELS[preference.defaultModel].name;

  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-900">{label}</p>
        {!preference.override ? <p className="text-xs text-neutral-500">{AI_ROUTING_MODEL_LABELS[preference.effectiveModel].description}</p> : null}
      </div>
      <select
        value={preference.override ?? AUTOMATIC_VALUE}
        disabled={isPending}
        onChange={(event) => handleChange(event.target.value)}
        className="shrink-0 rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900 disabled:opacity-50"
      >
        <option value={AUTOMATIC_VALUE}>Automatique — {defaultLabel} recommandé</option>
        {preference.allowedOverrides.map((model) => (
          <option key={model} value={model}>
            {AI_ROUTING_MODEL_LABELS[model].name}
          </option>
        ))}
      </select>
    </div>
  );
}
