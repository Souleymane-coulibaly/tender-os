"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "../../../../../components/ui";
import {
  archiveClientAccountAction,
  deleteClientAccountAction,
  restoreClientAccountAction,
} from "../../../client-portfolio-actions";
import type { ClientAccountSummary } from "../../../../../lib/client-portfolio-types";

export function ClientLifecycleActions({ client, canDelete }: { client: ClientAccountSummary; canDelete: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");

  const isArchived = client.status === "ARCHIVED";

  async function handleArchive() {
    setIsPending(true);
    const result = await archiveClientAccountAction(client.id);
    setIsPending(false);
    setConfirmingArchive(false);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  async function handleRestore() {
    setIsPending(true);
    const result = await restoreClientAccountAction(client.id);
    setIsPending(false);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  async function handleDelete() {
    setIsPending(true);
    const result = await deleteClientAccountAction(client.id);
    setIsPending(false);
    setError(result?.error);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {!isArchived ? (
          !confirmingArchive ? (
            <Button type="button" variant="danger" onClick={() => setConfirmingArchive(true)}>
              Archiver
            </Button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-tenderos-navy/10 p-2">
              <span className="text-xs text-tenderos-navy">Confirmer l&apos;archivage ?</span>
              <Button type="button" variant="danger" size="sm" onClick={handleArchive} disabled={isPending}>
                Confirmer
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingArchive(false)}>
                Annuler
              </Button>
            </div>
          )
        ) : (
          <Button type="button" onClick={handleRestore} disabled={isPending}>
            Restaurer
          </Button>
        )}

        {canDelete && isArchived ? (
          !confirmingDelete ? (
            <Button type="button" variant="danger" onClick={() => setConfirmingDelete(true)}>
              Supprimer définitivement
            </Button>
          ) : (
            <div className="flex flex-col items-end gap-2 rounded-lg bg-danger-bg p-3">
              <p className="max-w-xs text-right text-xs text-danger-fg">
                Cette action est irréversible : le client ne peut être supprimé que s&apos;il ne contient plus aucun appel
                d&apos;offres ni entrée de connaissance. Tapez <span className="font-semibold">SUPPRIMER</span> pour confirmer.
              </p>
              {/* `Input` sans label rend le contrôle nu : la largeur est portée par ce conteneur. */}
              <div className="w-40">
                <Input type="text" value={deleteConfirmationText} onChange={(event) => setDeleteConfirmationText(event.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isPending || deleteConfirmationText !== "SUPPRIMER"}
                >
                  Confirmer la suppression
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setConfirmingDelete(false);
                    setDeleteConfirmationText("");
                  }}
                >
                  Annuler
                </Button>
              </div>
            </div>
          )
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
