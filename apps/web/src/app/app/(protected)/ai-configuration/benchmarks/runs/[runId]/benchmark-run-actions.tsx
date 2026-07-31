"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelBenchmarkRunAction, generateModelRecommendationAction } from "../../../../../ai-configuration-actions";

export function CancelBenchmarkRunButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);

  async function handleCancel() {
    setIsPending(true);
    const result = await cancelBenchmarkRunAction(runId);
    setIsPending(false);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleCancel}
        disabled={isPending}
        className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {isPending ? "Annulation..." : "Annuler le benchmark"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function GenerateRecommendationButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleGenerate() {
    setIsPending(true);
    const result = await generateModelRecommendationAction(runId);
    setIsPending(false);
    setError(result.error);
    if (!result.error) {
      setDone(true);
      router.refresh();
    }
  }

  if (done) {
    return <p className="text-sm text-green-700">Recommandation générée. Consultez l&apos;onglet Recommandations.</p>;
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isPending}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Génération..." : "Générer une recommandation"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
