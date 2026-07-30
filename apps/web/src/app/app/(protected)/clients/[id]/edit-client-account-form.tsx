"use client";

import { useActionState } from "react";
import { updateClientAccountAction, type FormActionState } from "../../../client-portfolio-actions";
import type { ClientAccountSummary } from "../../../../../lib/client-portfolio-types";

const INITIAL_STATE: FormActionState = {};

export function EditClientAccountForm({ client, disabled }: { client: ClientAccountSummary; disabled: boolean }) {
  const boundAction = updateClientAccountAction.bind(null, client.id);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <fieldset disabled={disabled} className="flex flex-col gap-4 disabled:opacity-60">
        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-sm font-medium text-neutral-700">
            Nom *
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={200}
            defaultValue={client.name}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="legalName" className="text-sm font-medium text-neutral-700">
            Raison sociale
          </label>
          <input
            id="legalName"
            name="legalName"
            type="text"
            maxLength={240}
            defaultValue={client.legalName}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="reference" className="text-sm font-medium text-neutral-700">
              Référence interne
            </label>
            <input
              id="reference"
              name="reference"
              type="text"
              maxLength={100}
              defaultValue={client.reference}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="sector" className="text-sm font-medium text-neutral-700">
              Secteur
            </label>
            <input
              id="sector"
              name="sector"
              type="text"
              maxLength={120}
              defaultValue={client.sector}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="country" className="text-sm font-medium text-neutral-700">
              Pays
            </label>
            <input
              id="country"
              name="country"
              type="text"
              maxLength={10}
              defaultValue={client.country}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="website" className="text-sm font-medium text-neutral-700">
              Site web
            </label>
            <input
              id="website"
              name="website"
              type="url"
              maxLength={2048}
              defaultValue={client.website}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="address" className="text-sm font-medium text-neutral-700">
            Adresse
          </label>
          <textarea id="address" name="address" rows={2} defaultValue={client.address} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="notes" className="text-sm font-medium text-neutral-700">
            Notes
          </label>
          <textarea id="notes" name="notes" rows={3} defaultValue={client.notes} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
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
          {isPending ? "Enregistrement..." : "Enregistrer"}
        </button>
      </fieldset>
      {disabled ? <p className="text-xs text-neutral-500">Un client archivé ne peut plus être modifié — restaurez-le d&apos;abord.</p> : null}
    </form>
  );
}
