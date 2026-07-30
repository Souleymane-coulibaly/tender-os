"use client";

import { useActionState } from "react";
import { createClientAccountAction, type FormActionState } from "../../../client-portfolio-actions";

const INITIAL_STATE: FormActionState = {};

export function CreateClientAccountForm() {
  const [state, formAction, isPending] = useActionState(createClientAccountAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium text-neutral-700">
          Nom *
        </label>
        <input id="name" name="name" type="text" required maxLength={200} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="legalName" className="text-sm font-medium text-neutral-700">
          Raison sociale
        </label>
        <input id="legalName" name="legalName" type="text" maxLength={240} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="reference" className="text-sm font-medium text-neutral-700">
            Référence interne
          </label>
          <input id="reference" name="reference" type="text" maxLength={100} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="sector" className="text-sm font-medium text-neutral-700">
            Secteur
          </label>
          <input id="sector" name="sector" type="text" maxLength={120} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="country" className="text-sm font-medium text-neutral-700">
            Pays
          </label>
          <input id="country" name="country" type="text" maxLength={10} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="website" className="text-sm font-medium text-neutral-700">
            Site web
          </label>
          <input
            id="website"
            name="website"
            type="url"
            placeholder="https://..."
            maxLength={2048}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="address" className="text-sm font-medium text-neutral-700">
          Adresse
        </label>
        <textarea id="address" name="address" rows={2} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className="text-sm font-medium text-neutral-700">
          Notes
        </label>
        <textarea id="notes" name="notes" rows={3} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-sm font-medium text-neutral-700">
          Statut initial
        </label>
        <select id="status" name="status" defaultValue="ACTIVE" className="rounded border border-neutral-300 px-3 py-2 text-sm">
          <option value="ACTIVE">Actif</option>
          <option value="INACTIVE">Inactif</option>
        </select>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Création..." : "Créer le client"}
      </button>
    </form>
  );
}
