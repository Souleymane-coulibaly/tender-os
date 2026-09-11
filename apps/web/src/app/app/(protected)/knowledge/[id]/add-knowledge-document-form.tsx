"use client";

import { useActionState } from "react";
import { addDocumentToEntryAction, type FormActionState } from "../../../knowledge-actions";
import { FileInput } from "../../../../../components/ui/file-input";

const INITIAL_STATE: FormActionState = {};

export function AddKnowledgeDocumentForm({ entryId }: { entryId: string }) {
  const boundAction = addDocumentToEntryAction.bind(null, entryId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold text-neutral-700">Ajouter un document à cette entrée</h2>
      <div className="flex flex-col gap-1">
        <label htmlFor="new-doc-tags" className="text-xs text-neutral-600">
          Tags additionnels (séparés par une virgule)
        </label>
        <input
          id="new-doc-tags"
          name="tags"
          type="text"
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="new-doc-file" className="text-xs text-neutral-600">
          Fichier *
        </label>
        <FileInput id="new-doc-file" name="file" required />
      </div>
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
        {isPending ? "Import en cours..." : "Ajouter le document"}
      </button>
    </form>
  );
}
