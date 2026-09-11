"use client";

import { useActionState } from "react";
import { updateSubcontractorProfileAction, type FormActionState } from "../../../subcontractor-actions";
import type { SubcontractorProfile } from "../../../../../lib/subcontractor-types";
import { Button, FieldWrapper, Input, Textarea } from "../../../../../components/ui";

const INITIAL_STATE: FormActionState = {};

export function EditSubcontractorProfileForm({ profile, disabled }: { profile: SubcontractorProfile; disabled: boolean }) {
  const boundAction = updateSubcontractorProfileAction.bind(null, profile.id);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <fieldset disabled={disabled} className="flex flex-col gap-4 disabled:opacity-60">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Raison sociale *" name="legalName" defaultValue={profile.legalName} required maxLength={240} />
          <Field label="Nom commercial" name="tradeName" defaultValue={profile.tradeName} maxLength={240} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="SIREN" name="siren" defaultValue={profile.siren} maxLength={9} />
          <Field label="SIRET" name="siret" defaultValue={profile.siret} maxLength={14} />
        </div>
        <Field label="Adresse" name="addressLine" defaultValue={profile.addressLine} />
        <div className="grid grid-cols-3 gap-4">
          <Field label="Code postal" name="postalCode" defaultValue={profile.postalCode} />
          <Field label="Ville" name="city" defaultValue={profile.city} />
          <Field label="Pays" name="country" defaultValue={profile.country} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email de contact" name="contactEmail" type="email" defaultValue={profile.contactEmail} />
          <Field label="Téléphone" name="contactPhone" defaultValue={profile.contactPhone} />
        </div>
        <Field label="Domaines d'intervention" name="domains" defaultValue={profile.domains} textarea />
        <Field label="Compétences" name="skills" defaultValue={profile.skills} textarea />

        <div className="rounded-lg border border-tenderos-navy/10 p-3">
          <h3 className="mb-2 text-sm font-semibold text-tenderos-navy">Coordonnées bancaires</h3>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Titulaire" name="bankAccountHolder" defaultValue={profile.bankAccountHolder} />
            <Field label="IBAN" name="iban" defaultValue={profile.iban} mono />
            <Field label="BIC" name="bic" defaultValue={profile.bic} mono />
          </div>
        </div>

        {state.error ? (
          <p role="alert" className="text-sm text-danger-fg">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" disabled={isPending} className="self-start">
          {isPending ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </fieldset>
      {disabled ? <p className="text-xs text-tenderos-slate">Un sous-traitant archivé ne peut plus être modifié — restaurez-le d&apos;abord.</p> : null}
    </form>
  );
}

/** `FieldWrapper` + contrôle nu : le libellé reste exactement le texte fourni (astérisque littéral
 *  compris, jamais un second astérisque ajouté par le composant). */
function Field({
  label,
  name,
  defaultValue,
  type = "text",
  maxLength,
  required,
  textarea,
  mono,
}: {
  label: string;
  name: string;
  defaultValue?: string | null | undefined;
  type?: string;
  maxLength?: number;
  required?: boolean;
  textarea?: boolean;
  mono?: boolean;
}) {
  return (
    <FieldWrapper label={label}>
      {textarea ? (
        <Textarea id={name} name={name} rows={2} defaultValue={defaultValue ?? ""} />
      ) : (
        <Input id={name} name={name} type={type} required={required ?? false} maxLength={maxLength} defaultValue={defaultValue ?? ""} className={mono ? "font-mono" : ""} />
      )}
    </FieldWrapper>
  );
}
