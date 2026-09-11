"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../../../../components/ui";
import { archiveOpportunityAction } from "../../../opportunity-actions";

export function ArchiveOpportunityButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleConfirm(): Promise<void> {
    setIsPending(true);
    setError(undefined);
    const state = await archiveOpportunityAction(opportunityId);
    if (state.error) {
      setError(state.error);
      setIsPending(false);
      return;
    }
    setIsPending(false);
    setConfirming(false);
    router.refresh();
  }

  if (!confirming) {
    return (
      <Button type="button" variant="danger" size="sm" onClick={() => setConfirming(true)}>
        Archiver
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-danger-bg p-3">
      <p className="text-sm font-medium text-danger-fg">Confirmer l&apos;archivage de cette opportunité ?</p>
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="danger" size="sm" disabled={isPending} onClick={handleConfirm}>
          {isPending ? "Archivage…" : "Confirmer l'archivage"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
