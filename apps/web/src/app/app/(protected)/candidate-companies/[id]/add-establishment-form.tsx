"use client";

import { useActionState } from "react";
import { Button, Checkbox, Input } from "../../../../../components/ui";
import { addCandidateEstablishmentAction, type CandidateCompanyActionState } from "../../../candidate-company-actions";

const INITIAL_STATE: CandidateCompanyActionState = {};

export function AddEstablishmentForm({ candidateCompanyId }: { candidateCompanyId: string }) {
  const boundAction = addCandidateEstablishmentAction.bind(null, candidateCompanyId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="SIRET" name="siret" required maxLength={14} minLength={14} hint="14 chiffres." />
        <Input label="Libellé" name="label" maxLength={200} placeholder="Siège social, agence Lyon..." />
      </div>
      <Input label="Adresse" name="addressLine" maxLength={300} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Input label="Code postal" name="postalCode" maxLength={20} />
        <Input label="Ville" name="city" maxLength={120} />
        <Input label="Pays" name="country" maxLength={10} placeholder="FR" />
      </div>
      <Checkbox name="isPrincipal" label="Établissement principal" />

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-danger-fg">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" loading={isPending} className="self-start">
        Ajouter l&apos;établissement
      </Button>
    </form>
  );
}
