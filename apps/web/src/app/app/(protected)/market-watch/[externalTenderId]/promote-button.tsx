"use client";

import { useState, useTransition } from "react";
import { Alert, Button } from "../../../../../components/ui";
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
    return <span className="text-sm font-medium text-success-fg">Ajouté aux opportunités ✓</span>;
  }

  return (
    <div className="flex max-w-xs flex-col gap-2">
      <Button type="button" variant="primary" disabled={isPending} onClick={() => handlePromote()} className="self-start">
        {isPending ? "..." : "Ajouter à mes opportunités"}
      </Button>
      {error === "ALREADY_PROMOTED" ? (
        <Alert tone="warning">
          Ce marché a déjà été ajouté à vos opportunités.{" "}
          <Button type="button" variant="link" onClick={() => handlePromote(true)}>
            Ajouter quand même
          </Button>
        </Alert>
      ) : error ? (
        <p className="text-xs text-danger-fg">{error}</p>
      ) : null}
    </div>
  );
}
