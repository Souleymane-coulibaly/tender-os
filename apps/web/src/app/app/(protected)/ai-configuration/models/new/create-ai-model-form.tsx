"use client";

import { useActionState, useState } from "react";
import { Button, Checkbox, Input, Select } from "../../../../../../components/ui";
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
      <Select
        label="Fournisseur"
        id="provider"
        name="provider"
        required
        value={provider}
        onChange={(event) => setProvider(event.target.value)}
      >
        {providers.map((p) => (
          <option key={p} value={p}>
            {AI_PROVIDER_LABELS[p] ?? p}
          </option>
        ))}
      </Select>

      <Select label="Modèle" id="modelKey" name="modelKey" required>
        {(catalog[provider] ?? []).map((modelKey) => (
          <option key={modelKey} value={modelKey}>
            {modelKey}
          </option>
        ))}
      </Select>

      <Input label="Nom affiché" id="displayName" name="displayName" type="text" required maxLength={200} />

      <Checkbox label="Autoriser pour les benchmarks" id="enabledForBenchmark" name="enabledForBenchmark" className="self-start" />

      <Checkbox label="Autoriser en production" id="enabledForProduction" name="enabledForProduction" className="self-start" />

      {state.error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" disabled={isPending || providers.length === 0} className="self-start">
        {isPending ? "Enregistrement..." : "Enregistrer le modèle"}
      </Button>
    </form>
  );
}
