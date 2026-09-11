"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "../../../../../../components/ui";
import {
  addPricingSnapshotAction,
  disableAiModelAction,
  enableAiModelAction,
  updateAiModelProductionAction,
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
      <Button type="button" variant="secondary" onClick={handleToggle} disabled={isPending}>
        {model.status === "ENABLED" ? "Désactiver" : "Activer"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AiModelProductionToggle({ model }: { model: AiModelSummary }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);

  async function handleToggle() {
    setIsPending(true);
    const result = await updateAiModelProductionAction(model.id, !model.enabledForProduction);
    setIsPending(false);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="secondary" onClick={handleToggle} disabled={isPending}>
        {model.enabledForProduction ? "Retirer de la production" : "Autoriser en production"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
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
        <Input
          label="Prix / M tokens entrée"
          id="inputPricePerMillionTokens"
          name="inputPricePerMillionTokens"
          type="text"
          required
          placeholder="5.00"
        />
        <Input
          label="Prix / M tokens sortie"
          id="outputPricePerMillionTokens"
          name="outputPricePerMillionTokens"
          type="text"
          required
          placeholder="15.00"
        />
      </div>
      {/* Largeur courte portée par le wrapper (jamais un `w-*` sur l'Input, que `w-full` écraserait). */}
      <Input
        label="Devise (ISO 3)"
        id="currency"
        name="currency"
        type="text"
        required
        maxLength={3}
        defaultValue="USD"
        wrapperClassName="w-32"
      />

      {state.error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" disabled={isPending} className="self-start">
        {isPending ? "Enregistrement..." : "Ajouter un tarif"}
      </Button>
    </form>
  );
}
