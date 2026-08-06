"use client";

import { useActionState } from "react";
import { createSubcontractorProfileAction, type FormActionState } from "../../../subcontractor-actions";

const INITIAL_STATE: FormActionState = {};

export function CreateSubcontractorProfileForm() {
  const [state, formAction, isPending] = useActionState(createSubcontractorProfileAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="legalName" className="text-sm font-medium text-neutral-700">
            Raison sociale *
          </label>
          <input id="legalName" name="legalName" required maxLength={240} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="tradeName" className="text-sm font-medium text-neutral-700">
            Nom commercial
          </label>
          <input id="tradeName" name="tradeName" maxLength={240} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="siren" className="text-sm font-medium text-neutral-700">
            SIREN
          </label>
          <input id="siren" name="siren" maxLength={9} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="siret" className="text-sm font-medium text-neutral-700">
            SIRET
          </label>
          <input id="siret" name="siret" maxLength={14} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="addressLine" className="text-sm font-medium text-neutral-700">
          Adresse
        </label>
        <input id="addressLine" name="addressLine" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="postalCode" className="text-sm font-medium text-neutral-700">
            Code postal
          </label>
          <input id="postalCode" name="postalCode" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="city" className="text-sm font-medium text-neutral-700">
            Ville
          </label>
          <input id="city" name="city" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="country" className="text-sm font-medium text-neutral-700">
            Pays
          </label>
          <input id="country" name="country" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="contactEmail" className="text-sm font-medium text-neutral-700">
            Email de contact
          </label>
          <input id="contactEmail" name="contactEmail" type="email" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="contactPhone" className="text-sm font-medium text-neutral-700">
            Téléphone
          </label>
          <input id="contactPhone" name="contactPhone" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="domains" className="text-sm font-medium text-neutral-700">
          Domaines d&apos;intervention
        </label>
        <textarea id="domains" name="domains" rows={2} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="skills" className="text-sm font-medium text-neutral-700">
          Compétences
        </label>
        <textarea id="skills" name="skills" rows={2} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Création..." : "Créer le sous-traitant"}
      </button>
    </form>
  );
}
