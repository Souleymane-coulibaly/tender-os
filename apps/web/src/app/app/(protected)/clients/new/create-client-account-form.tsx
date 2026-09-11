"use client";

import { useActionState } from "react";
import { Button, Card, FieldWrapper, Input, Select, Textarea, fieldControlClasses } from "../../../../../components/ui";
import { createClientAccountAction, type FormActionState } from "../../../client-portfolio-actions";

const INITIAL_STATE: FormActionState = {};

export function CreateClientAccountForm() {
  const [state, formAction, isPending] = useActionState(createClientAccountAction, INITIAL_STATE);

  return (
    <Card>
      <form action={formAction} className="flex max-w-xl flex-col gap-4">
        {/* `FieldWrapper` plutôt que `Input label required` : le libellé visible et le nom
            accessible restent exactement « Nom * » (Input ajouterait son propre astérisque). */}
        <FieldWrapper label="Nom *">
          <input id="name" name="name" type="text" required maxLength={200} className={fieldControlClasses({})} />
        </FieldWrapper>

        <Input label="Raison sociale" id="legalName" name="legalName" type="text" maxLength={240} />

        <div className="grid grid-cols-2 gap-4">
          <Input label="Référence interne" id="reference" name="reference" type="text" maxLength={100} />
          <Input label="Secteur" id="sector" name="sector" type="text" maxLength={120} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input label="Pays" id="country" name="country" type="text" maxLength={10} />
          <Input label="Site web" id="website" name="website" type="url" placeholder="https://..." maxLength={2048} />
        </div>

        <Textarea label="Adresse" id="address" name="address" rows={2} />

        <Textarea label="Notes" id="notes" name="notes" rows={3} />

        <Select label="Statut initial" id="status" name="status" defaultValue="ACTIVE">
          <option value="ACTIVE">Actif</option>
          <option value="INACTIVE">Inactif</option>
        </Select>

        {state.error ? (
          <p role="alert" className="text-sm text-danger-fg">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" disabled={isPending} className="self-start">
          {isPending ? "Création..." : "Créer le client"}
        </Button>
      </form>
    </Card>
  );
}
