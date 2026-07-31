"use client";

import { useActionState, useState } from "react";
import { createRoutingPolicyAction, type FormActionState } from "../../../../ai-configuration-actions";
import {
  ESCALATION_CONDITIONS,
  ESCALATION_CONDITION_LABELS,
  PROMPT_KEY_LABELS,
  type AiModelSummary,
  type PromptKey,
} from "../../../../../../lib/ai-configuration-types";

const INITIAL_STATE: FormActionState = {};

const PROMPT_KEYS: readonly PromptKey[] = ["ANALYZE_DOCUMENT", "CONSOLIDATE_TENDER_ANALYSIS"];

export function CreateRoutingPolicyForm({ models }: { models: AiModelSummary[] }) {
  const [state, formAction, isPending] = useActionState(createRoutingPolicyAction, INITIAL_STATE);
  const [hasEscalation, setHasEscalation] = useState(false);

  if (models.length === 0) {
    return <p className="text-sm text-neutral-600">Aucun modèle activé pour la production. Activez-en un depuis la page Modèles.</p>;
  }

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="promptKey" className="text-sm font-medium text-neutral-700">
          Tâche IA *
        </label>
        <select id="promptKey" name="promptKey" required className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {PROMPT_KEYS.map((key) => (
            <option key={key} value={key}>
              {PROMPT_KEY_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="primaryAiModelId" className="text-sm font-medium text-neutral-700">
          Modèle principal *
        </label>
        <select id="primaryAiModelId" name="primaryAiModelId" required className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.displayName} ({model.provider}/{model.modelKey})
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={hasEscalation} onChange={(event) => setHasEscalation(event.target.checked)} className="h-4 w-4" />
        Configurer un modèle d&apos;escalade
      </label>

      {hasEscalation ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="escalationAiModelId" className="text-sm font-medium text-neutral-700">
            Modèle d&apos;escalade
          </label>
          <select id="escalationAiModelId" name="escalationAiModelId" className="rounded border border-neutral-300 px-3 py-2 text-sm">
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.displayName} ({model.provider}/{model.modelKey})
              </option>
            ))}
          </select>

          <fieldset className="mt-2 flex flex-col gap-2">
            <legend className="text-sm font-medium text-neutral-700">Déclencheurs d&apos;escalade</legend>
            {ESCALATION_CONDITIONS.map((condition) => (
              <label key={condition} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="escalationConditions" value={condition} className="h-4 w-4" />
                {ESCALATION_CONDITION_LABELS[condition]}
              </label>
            ))}
          </fieldset>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="timeoutMs" className="text-sm font-medium text-neutral-700">
            Délai maximal (ms)
          </label>
          <input
            id="timeoutMs"
            name="timeoutMs"
            type="number"
            min={1000}
            defaultValue={30000}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="maxRetries" className="text-sm font-medium text-neutral-700">
            Tentatives max.
          </label>
          <input
            id="maxRetries"
            name="maxRetries"
            type="number"
            min={0}
            max={5}
            defaultValue={1}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Création..." : "Créer la politique (brouillon)"}
      </button>
    </form>
  );
}
