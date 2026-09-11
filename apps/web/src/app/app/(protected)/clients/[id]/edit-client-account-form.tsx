"use client";

import { useActionState } from "react";
import { Button, FieldWrapper, Input, Textarea, fieldControlClasses } from "../../../../../components/ui";
import { updateClientAccountAction, type FormActionState } from "../../../client-portfolio-actions";
import type { ClientAccountSummary } from "../../../../../lib/client-portfolio-types";

const INITIAL_STATE: FormActionState = {};

export function EditClientAccountForm({ client, disabled }: { client: ClientAccountSummary; disabled: boolean }) {
  const boundAction = updateClientAccountAction.bind(null, client.id);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <fieldset disabled={disabled} className="flex flex-col gap-4 disabled:opacity-60">
        {/* `FieldWrapper` plutôt que `Input label required` : le libellé visible et le nom
            accessible restent exactement « Nom * » (Input ajouterait son propre astérisque). */}
        <FieldWrapper label="Nom *">
          <input id="name" name="name" type="text" required maxLength={200} defaultValue={client.name} className={fieldControlClasses({})} />
        </FieldWrapper>

        <Input label="Raison sociale" id="legalName" name="legalName" type="text" maxLength={240} defaultValue={client.legalName} />

        <div className="grid grid-cols-2 gap-4">
          <Input label="Référence interne" id="reference" name="reference" type="text" maxLength={100} defaultValue={client.reference} />
          <Input label="Secteur" id="sector" name="sector" type="text" maxLength={120} defaultValue={client.sector} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input label="Pays" id="country" name="country" type="text" maxLength={10} defaultValue={client.country} />
          <Input label="Site web" id="website" name="website" type="url" maxLength={2048} defaultValue={client.website} />
        </div>

        <Textarea label="Adresse" id="address" name="address" rows={2} defaultValue={client.address} />

        <Textarea label="Notes" id="notes" name="notes" rows={3} defaultValue={client.notes} />

        {state.error ? (
          <p role="alert" className="text-sm text-danger-fg">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" disabled={isPending} className="self-start">
          {isPending ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </fieldset>
      {disabled ? <p className="text-xs text-tenderos-slate">Un client archivé ne peut plus être modifié — restaurez-le d&apos;abord.</p> : null}
    </form>
  );
}
