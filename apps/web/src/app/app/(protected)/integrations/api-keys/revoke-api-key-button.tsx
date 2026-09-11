"use client";

import { useState, useTransition } from "react";
import { Button } from "../../../../../components/ui";
import { revokeApiKeyAction } from "../../../integrations-actions";

export function RevokeApiKeyButton({ apiKeyId }: { apiKeyId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button type="button" variant="danger" size="sm" onClick={() => setConfirming(true)}>
        Révoquer
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-danger-bg p-3">
      <p className="text-sm font-medium text-danger-fg">Révoquer cette clé ? L&apos;effet est immédiat et irréversible.</p>
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await revokeApiKeyAction(apiKeyId);
              if (result.error) setError(result.error);
              else setConfirming(false);
            })
          }
        >
          {isPending ? "Révocation..." : "Confirmer la révocation"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
