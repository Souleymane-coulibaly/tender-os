"use client";

import { useActionState } from "react";
import { createTenderAction, type FormActionState } from "../../../actions";

const INITIAL_STATE: FormActionState = {};

export function CreateTenderForm() {
  const [state, formAction, isPending] = useActionState(createTenderAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-sm font-medium text-neutral-700">
          Titre *
        </label>
        <input id="title" name="title" type="text" required className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="reference" className="text-sm font-medium text-neutral-700">
          Reference
        </label>
        <input id="reference" name="reference" type="text" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="buyerName" className="text-sm font-medium text-neutral-700">
          Acheteur
        </label>
        <input id="buyerName" name="buyerName" type="text" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="procedureType" className="text-sm font-medium text-neutral-700">
            Type de procedure
          </label>
          <input
            id="procedureType"
            name="procedureType"
            type="text"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="marketType" className="text-sm font-medium text-neutral-700">
            Type de marche
          </label>
          <input id="marketType" name="marketType" type="text" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="estimatedAmount" className="text-sm font-medium text-neutral-700">
            Montant estime
          </label>
          <input
            id="estimatedAmount"
            name="estimatedAmount"
            type="text"
            inputMode="decimal"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="submissionDeadline" className="text-sm font-medium text-neutral-700">
            Date limite de remise
          </label>
          <input
            id="submissionDeadline"
            name="submissionDeadline"
            type="date"
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
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
        {isPending ? "Creation..." : "Creer l'appel d'offres"}
      </button>
    </form>
  );
}
