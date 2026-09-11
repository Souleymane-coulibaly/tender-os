"use client";

import { useState } from "react";
import {
  archiveDocumentAction,
  deleteDocumentAction,
  restoreDocumentAction,
} from "../../../documents-actions";
import type { DocumentSummary } from "../../../../../lib/documents-types";
import { Button } from "../../../../../components/ui";

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
          <Button type="button" variant="danger" onClick={handleArchive} disabled={isPending}>
            Archiver
          </Button>
        ) : (
          <Button type="button" onClick={handleRestore} disabled={isPending}>
            Restaurer
          </Button>
        )}

        {!confirmingDelete ? (
          <Button type="button" variant="danger" onClick={() => setConfirmingDelete(true)}>
            Supprimer
          </Button>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-danger-bg p-2">
            <span className="text-xs text-danger-fg">Confirmer la suppression ?</span>
            <Button type="button" variant="danger" size="sm" onClick={handleDelete} disabled={isPending}>
              Confirmer
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
              Annuler
            </Button>
          </div>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
