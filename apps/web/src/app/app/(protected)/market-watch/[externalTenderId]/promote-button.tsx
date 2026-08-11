"use client";

import { useState, useTransition } from "react";
import { promoteExternalTenderAction } from "../../../market-watch-actions";

/** Mission §53/§55 — jamais automatique, toujours une action explicite. */
export function PromoteButton({ externalTenderId }: { externalTenderId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [promotedId, setPromotedId] = useState<string | undefined>();

  function handlePromote(confirmDuplicate?: boolean) {
    setError(undefined);
    startTransition(async () => {
      const result = await promoteExternalTenderAction(externalTenderId, undefined, confirmDuplicate);
      if (result.error) {
        setError(result.error);
        return;
      }
      setPromotedId(result.opportunityId);
    });
  }

  if (promotedId) {
    return <span className="text-sm font-medium text-green-700">Ajouté aux opportunités ✓</span>;
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" disabled={isPending} onClick={() => handlePromote()} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "..." : "Ajouter à mes opportunités"}
      </button>
      {error === "ALREADY_PROMOTED" ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
          Ce marché a déjà été ajouté à vos opportunités.{" "}
          <button type="button" onClick={() => handlePromote(true)} className="font-medium underline">
            Ajouter quand même
          </button>
        </div>
      ) : error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
