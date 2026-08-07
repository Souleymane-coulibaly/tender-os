"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
      <button type="button" onClick={() => setConfirming(true)} className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
        Archiver
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-red-200 p-3">
      <p className="text-sm font-medium text-red-800">Confirmer l&apos;archivage de cette opportunité ?</p>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="button" disabled={isPending} onClick={handleConfirm} className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {isPending ? "Archivage…" : "Confirmer l'archivage"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="rounded px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">
          Annuler
        </button>
      </div>
    </div>
  );
}
