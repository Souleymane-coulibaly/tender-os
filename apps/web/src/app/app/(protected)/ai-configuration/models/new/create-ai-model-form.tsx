"use client";

import { useActionState, useState } from "react";
import { createAiModelAction, type FormActionState } from "../../../../ai-configuration-actions";
import {
  AI_PROVIDER_LABELS,
  type AllowedModelCatalog,
} from "../../../../../../lib/ai-configuration-types";

const INITIAL_STATE: FormActionState = {};

/** Sélection contrôlée uniquement (Sprint 5.2 §"Ne proposer aucun champ texte libre permettant
 *  d'injecter un modèle arbitraire") — les options du `<select>` viennent exclusivement du
 *  catalogue autorisé renvoyé par l'API (`GET /ai-models/allowed-catalog`), jamais une saisie
 *  libre côté client. */
export function CreateAiModelForm({ catalog }: { catalog: AllowedModelCatalog }) {
  const [state, formAction, isPending] = useActionState(createAiModelAction, INITIAL_STATE);
  const providers = Object.keys(catalog).filter((provider) => catalog[provider]!.length > 0);
  const [provider, setProvider] = useState(providers[0] ?? "");

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="provider" className="text-sm font-medium text-neutral-700">
          Fournisseur *
        </label>
        <select
          id="provider"
          name="provider"
          required
          value={provider}
          onChange={(event) => setProvider(event.target.value)}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          {providers.map((p) => (
            <option key={p} value={p}>
              {AI_PROVIDER_LABELS[p] ?? p}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="modelKey" className="text-sm font-medium text-neutral-700">
          Modèle *
        </label>
        <select
          id="modelKey"
          name="modelKey"
          required
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        >
          {(catalog[provider] ?? []).map((modelKey) => (
            <option key={modelKey} value={modelKey}>
              {modelKey}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="displayName" className="text-sm font-medium text-neutral-700">
          Nom affiché *
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          maxLength={200}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="enabledForBenchmark"
          name="enabledForBenchmark"
          type="checkbox"
          className="h-4 w-4"
        />
        <label htmlFor="enabledForBenchmark" className="text-sm text-neutral-700">
          Autoriser pour les benchmarks
        </label>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="enabledForProduction"
          name="enabledForProduction"
          type="checkbox"
          className="h-4 w-4"
        />
        <label htmlFor="enabledForProduction" className="text-sm text-neutral-700">
          Autoriser en production
        </label>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending || providers.length === 0}
        className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Enregistrement..." : "Enregistrer le modèle"}
      </button>
    </form>
  );
}
