"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addPricingSnapshotAction,
  disableAiModelAction,
  enableAiModelAction,
  type FormActionState,
} from "../../../../ai-configuration-actions";
import type { AiModelSummary } from "../../../../../../lib/ai-configuration-types";

const INITIAL_STATE: FormActionState = {};

export function AiModelStatusToggle({ model }: { model: AiModelSummary }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);

  async function handleToggle() {
    setIsPending(true);
    const result = model.status === "ENABLED" ? await disableAiModelAction(model.id) : await enableAiModelAction(model.id);
    setIsPending(false);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
      >
        {model.status === "ENABLED" ? "Désactiver" : "Activer"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AddPricingSnapshotForm({ modelId }: { modelId: string }) {
  const boundAction = addPricingSnapshotAction.bind(null, modelId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="inputPricePerMillionTokens" className="text-sm font-medium text-neutral-700">
            Prix / M tokens entrée *
          </label>
          <input
            id="inputPricePerMillionTokens"
            name="inputPricePerMillionTokens"
            type="text"
            required
            placeholder="5.00"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="outputPricePerMillionTokens" className="text-sm font-medium text-neutral-700">
            Prix / M tokens sortie *
          </label>
          <input
            id="outputPricePerMillionTokens"
            name="outputPricePerMillionTokens"
            type="text"
            required
            placeholder="15.00"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="currency" className="text-sm font-medium text-neutral-700">
          Devise (ISO 3) *
        </label>
        <input
          id="currency"
          name="currency"
          type="text"
          required
          maxLength={3}
          defaultValue="USD"
          className="w-24 rounded border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Enregistrement..." : "Ajouter un tarif"}
      </button>
    </form>
  );
}
