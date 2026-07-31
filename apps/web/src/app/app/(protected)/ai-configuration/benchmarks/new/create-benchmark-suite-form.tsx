"use client";

import { useActionState } from "react";
import { createBenchmarkSuiteAction, type FormActionState } from "../../../../ai-configuration-actions";
import { PROMPT_KEY_LABELS, type PromptKey } from "../../../../../../lib/ai-configuration-types";

const INITIAL_STATE: FormActionState = {};

const PROMPT_KEYS: readonly PromptKey[] = ["ANALYZE_DOCUMENT", "CONSOLIDATE_TENDER_ANALYSIS"];

export function CreateBenchmarkSuiteForm() {
  const [state, formAction, isPending] = useActionState(createBenchmarkSuiteAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium text-neutral-700">
          Nom de la suite *
        </label>
        <input id="name" name="name" type="text" required maxLength={200} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

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
        <label htmlFor="description" className="text-sm font-medium text-neutral-700">
          Description
        </label>
        <textarea id="description" name="description" rows={2} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
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
        {isPending ? "Création..." : "Créer la suite"}
      </button>
    </form>
  );
}
