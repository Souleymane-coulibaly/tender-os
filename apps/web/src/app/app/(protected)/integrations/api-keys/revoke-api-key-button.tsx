"use client";

import { useState, useTransition } from "react";
import { revokeApiKeyAction } from "../../../integrations-actions";

export function RevokeApiKeyButton({ apiKeyId }: { apiKeyId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
        Révoquer
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-red-200 p-3">
      <p className="text-sm font-medium text-red-800">Révoquer cette clé ? L&apos;effet est immédiat et irréversible.</p>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await revokeApiKeyAction(apiKeyId);
              if (result.error) setError(result.error);
              else setConfirming(false);
            })
          }
          className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Révocation..." : "Confirmer la révocation"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="rounded px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">
          Annuler
        </button>
      </div>
    </div>
  );
}
