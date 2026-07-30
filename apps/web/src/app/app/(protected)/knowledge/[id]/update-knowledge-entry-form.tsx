"use client";

import { useActionState } from "react";
import { updateKnowledgeEntryAction, type FormActionState } from "../../../knowledge-actions";
import type { KnowledgeEntrySummary } from "../../../../../lib/knowledge-types";
import { KnowledgeMetadataFields } from "../knowledge-metadata-fields";

const INITIAL_STATE: FormActionState = {};

export function UpdateKnowledgeEntryForm({ entry }: { entry: KnowledgeEntrySummary }) {
  const boundAction = updateKnowledgeEntryAction.bind(null, entry.id);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold text-neutral-700">Modifier les métadonnées</h2>
      <p className="text-xs text-neutral-500">Chaque modification crée une nouvelle version de l&apos;entrée.</p>
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-xs text-neutral-600">
          Titre
        </label>
        <input id="title" name="title" type="text" defaultValue={entry.title} className="rounded border border-neutral-300 px-2 py-1 text-sm" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-xs text-neutral-600">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={entry.description}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="language" className="text-xs text-neutral-600">
          Langue
        </label>
        <input
          id="language"
          name="language"
          type="text"
          defaultValue={entry.language}
          className="w-24 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>

      <KnowledgeMetadataFields category={entry.category} defaultValues={entry.metadata} />

      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
      >
        {isPending ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>
  );
}
