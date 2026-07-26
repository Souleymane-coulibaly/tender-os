"use client";

import { useActionState } from "react";
import { addDocumentVersionAction, type FormActionState } from "../../../documents-actions";

const INITIAL_STATE: FormActionState = {};

export function AddVersionForm({ documentId }: { documentId: string }) {
  const boundAction = addDocumentVersionAction.bind(null, documentId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex items-end gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor="version-file" className="text-xs text-neutral-600">
          Nouvelle version (fichier)
        </label>
        <input id="version-file" name="file" type="file" required className="text-sm" />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
      >
        {isPending ? "Depot en cours..." : "Deposer une nouvelle version"}
      </button>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
