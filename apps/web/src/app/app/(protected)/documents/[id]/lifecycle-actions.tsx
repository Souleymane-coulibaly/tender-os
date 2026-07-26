"use client";

import { useState } from "react";
import {
  archiveDocumentAction,
  deleteDocumentAction,
  restoreDocumentAction,
} from "../../../documents-actions";
import type { DocumentSummary } from "../../../../../lib/documents-types";

export function LifecycleActions({ doc }: { doc: DocumentSummary }) {
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleArchive() {
    setIsPending(true);
    const result = await archiveDocumentAction(doc.id);
    setIsPending(false);
    setError(result.error);
  }

  async function handleRestore() {
    setIsPending(true);
    const result = await restoreDocumentAction(doc.id);
    setIsPending(false);
    setError(result.error);
  }

  async function handleDelete() {
    setIsPending(true);
    await deleteDocumentAction(doc.id);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {doc.status === "ACTIVE" ? (
          <button
            type="button"
            onClick={handleArchive}
            disabled={isPending}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
          >
            Archiver
          </button>
        ) : (
          <button
            type="button"
            onClick={handleRestore}
            disabled={isPending}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
          >
            Restaurer
          </button>
        )}

        {!confirmingDelete ? (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Supprimer
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded border border-red-200 p-2">
            <span className="text-xs text-red-800">Confirmer la suppression ?</span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="rounded bg-red-700 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Confirmer
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
            >
              Annuler
            </button>
          </div>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
