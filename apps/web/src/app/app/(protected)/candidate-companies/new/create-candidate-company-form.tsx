"use client";

import { useActionState } from "react";
import { Button, Card, Input } from "../../../../../components/ui";
import { createCandidateCompanyAction, type CandidateCompanyActionState } from "../../../candidate-company-actions";

const INITIAL_STATE: CandidateCompanyActionState = {};

export function CreateCandidateCompanyForm() {
  const [state, formAction, isPending] = useActionState(createCandidateCompanyAction, INITIAL_STATE);

  return (
    <Card>
      <form action={formAction} className="flex max-w-xl flex-col gap-4">
        <Input label="Nom" name="name" required maxLength={200} />
        <Input label="Raison sociale" name="legalName" maxLength={240} hint="Nom d'usage affiché si renseigné (sinon le nom ci-dessus est utilisé)." />
        <div className="grid grid-cols-2 gap-4">
          <Input label="SIREN" name="siren" maxLength={9} hint="9 chiffres." />
          <Input label="Forme juridique" name="legalForm" maxLength={120} placeholder="SAS, SARL..." />
        </div>
        <Input label="Numéro de TVA intracommunautaire" name="vatNumber" maxLength={20} />

        {state.error ? (
          <p role="alert" className="text-sm font-medium text-danger-fg">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" loading={isPending} className="self-start">
          Créer l&apos;entreprise candidate
        </Button>
      </form>
    </Card>
  );
}
