"use client";

import { useState } from "react";
import {
  archiveKnowledgeEntryAction,
  deleteKnowledgeEntryAction,
  restoreKnowledgeEntryAction,
} from "../../../knowledge-actions";
import type { KnowledgeEntrySummary } from "../../../../../lib/knowledge-types";

export function KnowledgeLifecycleActions({ entry, canDelete }: { entry: KnowledgeEntrySummary; canDelete: boolean }) {
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");

  const isArchived = entry.status === "ARCHIVED";

  async function handleArchive() {
    setIsPending(true);
    const result = await archiveKnowledgeEntryAction(entry.id);
    setIsPending(false);
    setConfirmingArchive(false);
    setError(result.error);
  }

  async function handleRestore() {
    setIsPending(true);
    const result = await restoreKnowledgeEntryAction(entry.id);
    setIsPending(false);
    setError(result.error);
  }

  async function handleDelete() {
    setIsPending(true);
    const result = await deleteKnowledgeEntryAction(entry.id);
    setIsPending(false);
    setError(result?.error);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {!isArchived ? (
          !confirmingArchive ? (
            <button
              type="button"
              onClick={() => setConfirmingArchive(true)}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
            >
              Archiver
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded border border-neutral-200 p-2">
              <span className="text-xs text-neutral-700">Confirmer l&apos;archivage ?</span>
              <button
                type="button"
                onClick={handleArchive}
                disabled={isPending}
                className="rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                Confirmer
              </button>
              <button
                type="button"
                onClick={() => setConfirmingArchive(false)}
                className="rounded px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
              >
                Annuler
              </button>
            </div>
          )
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

        {canDelete && isArchived ? (
          !confirmingDelete ? (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Supprimer définitivement
            </button>
          ) : (
            <div className="flex flex-col items-end gap-2 rounded border border-red-300 bg-red-50 p-3">
              <p className="max-w-xs text-right text-xs text-red-800">
                Cette action est irréversible : l&apos;entrée, ses documents, ses versions et ses tags associés seront
                définitivement supprimés. Tapez <span className="font-semibold">SUPPRIMER</span> pour confirmer.
              </p>
              <input
                type="text"
                value={deleteConfirmationText}
                onChange={(event) => setDeleteConfirmationText(event.target.value)}
                className="w-40 rounded border border-red-300 px-2 py-1 text-xs"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isPending || deleteConfirmationText !== "SUPPRIMER"}
                  className="rounded bg-red-700 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  Confirmer la suppression
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingDelete(false);
                    setDeleteConfirmationText("");
                  }}
                  className="rounded px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                >
                  Annuler
                </button>
              </div>
            </div>
          )
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
