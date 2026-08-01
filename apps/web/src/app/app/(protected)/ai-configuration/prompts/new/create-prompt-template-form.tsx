"use client";

import { useActionState } from "react";
import { createPromptTemplateAction, type FormActionState } from "../../../../generation-actions";
import { GENERATION_TASK_TYPE_LABELS } from "../../../../../../lib/generation-types";

const INITIAL_STATE: FormActionState = {};

export function CreatePromptTemplateForm() {
  const [state, formAction, isPending] = useActionState(createPromptTemplateAction, INITIAL_STATE);
  const taskTypes = Object.entries(GENERATION_TASK_TYPE_LABELS);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="taskType" className="text-sm font-medium text-neutral-700">
          Type de tâche *
        </label>
        <select id="taskType" name="taskType" required className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {taskTypes.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium text-neutral-700">
          Nom *
        </label>
        <input id="name" name="name" type="text" required maxLength={200} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="outputMode" className="text-sm font-medium text-neutral-700">
          Mode de sortie *
        </label>
        <select id="outputMode" name="outputMode" required className="rounded border border-neutral-300 px-3 py-2 text-sm">
          <option value="FREE_TEXT">Texte libre</option>
          <option value="STRUCTURED">Structuré (JSON validé)</option>
        </select>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Création..." : "Créer le template"}
      </button>
    </form>
  );
}
