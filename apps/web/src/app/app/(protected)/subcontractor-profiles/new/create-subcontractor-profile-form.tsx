"use client";

import { useActionState } from "react";
import { createSubcontractorProfileAction, type FormActionState } from "../../../subcontractor-actions";
import { Button, Card, FieldWrapper, Input, Textarea } from "../../../../../components/ui";

const INITIAL_STATE: FormActionState = {};

export function CreateSubcontractorProfileForm() {
  const [state, formAction, isPending] = useActionState(createSubcontractorProfileAction, INITIAL_STATE);

  return (
    <Card>
      <form action={formAction} className="flex max-w-2xl flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          {/* `FieldWrapper` + contrôle nu : le libellé reste exactement « Raison sociale * ». */}
          <FieldWrapper label="Raison sociale *">
            <Input id="legalName" name="legalName" required maxLength={240} />
          </FieldWrapper>
          <Input label="Nom commercial" id="tradeName" name="tradeName" maxLength={240} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input label="SIREN" id="siren" name="siren" maxLength={9} />
          <Input label="SIRET" id="siret" name="siret" maxLength={14} />
        </div>

        <Input label="Adresse" id="addressLine" name="addressLine" />
        <div className="grid grid-cols-3 gap-4">
          <Input label="Code postal" id="postalCode" name="postalCode" />
          <Input label="Ville" id="city" name="city" />
          <Input label="Pays" id="country" name="country" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input label="Email de contact" id="contactEmail" name="contactEmail" type="email" />
          <Input label="Téléphone" id="contactPhone" name="contactPhone" />
        </div>

        <Textarea label="Domaines d'intervention" id="domains" name="domains" rows={2} />
        <Textarea label="Compétences" id="skills" name="skills" rows={2} />

        {state.error ? (
          <p role="alert" className="text-sm text-danger-fg">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" disabled={isPending} className="self-start">
          {isPending ? "Création..." : "Créer le sous-traitant"}
        </Button>
      </form>
    </Card>
  );
}
