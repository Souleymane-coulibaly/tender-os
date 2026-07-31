"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { estimateBenchmarkRunCostAction, launchBenchmarkRunAction, publishBenchmarkSuiteAction } from "../../../../ai-configuration-actions";
import type { AiModelSummary, BenchmarkCostEstimate } from "../../../../../../lib/ai-configuration-types";

export function PublishSuiteButton({ suiteId }: { suiteId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);

  async function handlePublish() {
    setIsPending(true);
    const result = await publishBenchmarkSuiteAction(suiteId);
    setIsPending(false);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handlePublish}
        disabled={isPending}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Publication..." : "Publier cette suite"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function LaunchBenchmarkRunForm({ suiteId, models }: { suiteId: string; models: AiModelSummary[] }) {
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [repetitions, setRepetitions] = useState(1);
  const [estimate, setEstimate] = useState<BenchmarkCostEstimate | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [isEstimating, setIsEstimating] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function toggleModel(modelId: string) {
    setEstimate(undefined);
    setSelectedModelIds((current) => (current.includes(modelId) ? current.filter((id) => id !== modelId) : [...current, modelId]));
  }

  async function handleEstimate() {
    if (selectedModelIds.length === 0) {
      setError("Sélectionnez au moins un modèle.");
      return;
    }
    setIsEstimating(true);
    setError(undefined);
    const result = await estimateBenchmarkRunCostAction({ suiteId, modelIds: selectedModelIds, repetitions });
    setIsEstimating(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEstimate(result.estimate);
    setConfirming(true);
  }

  async function handleLaunch(formData: FormData) {
    setIsLaunching(true);
    const result = await launchBenchmarkRunAction({}, formData);
    setIsLaunching(false);
    if (result?.error) setError(result.error);
  }

  if (models.length === 0) {
    return <p className="text-sm text-neutral-600">Aucun modèle autorisé pour le benchmark. Activez-en un depuis la page Modèles.</p>;
  }

  return (
    <form action={handleLaunch} className="flex flex-col gap-4">
      <input type="hidden" name="suiteId" value={suiteId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-neutral-700">Modèles à comparer *</legend>
        {models.map((model) => (
          <label key={model.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="modelIds"
              value={model.id}
              checked={selectedModelIds.includes(model.id)}
              onChange={() => toggleModel(model.id)}
              className="h-4 w-4"
            />
            {model.displayName} ({model.provider}/{model.modelKey})
          </label>
        ))}
      </fieldset>

      <div className="flex items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="repetitions" className="text-sm font-medium text-neutral-700">
            Répétitions
          </label>
          <input
            id="repetitions"
            name="repetitions"
            type="number"
            min={1}
            max={5}
            value={repetitions}
            onChange={(event) => {
              setRepetitions(Number(event.target.value));
              setEstimate(undefined);
            }}
            className="w-20 rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <input type="hidden" name="concurrencyLimit" value={1} />
        <button
          type="button"
          onClick={handleEstimate}
          disabled={isEstimating}
          className="rounded border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100 disabled:opacity-50"
        >
          {isEstimating ? "Estimation..." : "Estimer le coût"}
        </button>
      </div>

      {estimate ? (
        <p className="text-sm text-neutral-700">
          Coût estimé (approximatif, jamais exact) : <span className="font-medium">{estimate.amount} {estimate.currency}</span>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {confirming ? (
        <button
          type="submit"
          disabled={isLaunching}
          className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isLaunching ? "Lancement..." : "Confirmer le lancement"}
        </button>
      ) : null}
    </form>
  );
}
