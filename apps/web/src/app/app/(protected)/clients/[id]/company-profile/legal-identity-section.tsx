"use client";

import { useActionState } from "react";
import { upsertLegalIdentityAction, type FormActionState } from "../../../../company-profile-actions";
import type { CompanyLegalIdentity } from "../../../../../../lib/company-profile-types";

const INITIAL_STATE: FormActionState = {};

export function LegalIdentitySection({ clientId, legalIdentity }: { clientId: string; legalIdentity: CompanyLegalIdentity | null }) {
  const boundAction = upsertLegalIdentityAction.bind(null, clientId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);
  const isDuplicateConflict = state.error?.includes("SIRET") ?? false;

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <p className="text-sm text-neutral-600">
        Aucun champ n&apos;est obligatoire ici — complétez au fil de l&apos;eau, la fiche reste utilisable en l&apos;état.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Raison sociale" name="legalName" defaultValue={legalIdentity?.legalName} />
        <Field label="Nom commercial" name="tradeName" defaultValue={legalIdentity?.tradeName} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="SIREN" name="siren" defaultValue={legalIdentity?.siren} maxLength={9} />
        <Field label="SIRET (siège)" name="siretPrincipal" defaultValue={legalIdentity?.siretPrincipal} maxLength={14} />
        <Field label="N° TVA intracommunautaire" name="vatNumber" defaultValue={legalIdentity?.vatNumber} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Forme juridique" name="legalForm" defaultValue={legalIdentity?.legalForm} />
        <Field label="Code APE/NAF" name="apeCode" defaultValue={legalIdentity?.apeCode} />
      </div>

      <Field label="Adresse" name="addressLine" defaultValue={legalIdentity?.addressLine} />
      <div className="grid grid-cols-3 gap-4">
        <Field label="Code postal" name="postalCode" defaultValue={legalIdentity?.postalCode} />
        <Field label="Ville" name="city" defaultValue={legalIdentity?.city} />
        <Field label="Pays" name="country" defaultValue={legalIdentity?.country} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Téléphone" name="phone" defaultValue={legalIdentity?.phone} />
        <Field label="Email général" name="generalEmail" type="email" defaultValue={legalIdentity?.generalEmail} />
        <Field label="Site web" name="website" type="url" defaultValue={legalIdentity?.website} />
      </div>

      {isDuplicateConflict ? (
        <label className="flex items-center gap-2 text-sm text-amber-800">
          <input type="checkbox" name="confirmDuplicate" value="true" className="h-4 w-4" />
          Je confirme volontairement ce SIRET malgré le doublon détecté dans mon organisation.
        </label>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  maxLength,
}: {
  label: string;
  name: string;
  defaultValue?: string | null | undefined;
  type?: string;
  maxLength?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium text-neutral-700">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        maxLength={maxLength}
        defaultValue={defaultValue ?? ""}
        className="rounded border border-neutral-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
