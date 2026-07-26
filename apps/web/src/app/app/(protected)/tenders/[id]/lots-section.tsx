"use client";

import { useActionState } from "react";
import { createLotAction, type FormActionState } from "../../../actions";
import type { TenderLot } from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};

export function LotsSection({ tenderId, lots }: { tenderId: string; lots: TenderLot[] }) {
  const boundAction = createLotAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-700">Lots</h2>
      {lots.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucun lot.</p>
      ) : (
        <ul>
          {lots.map((lot) => (
            <li key={lot.id} className="border-b border-neutral-100 py-2 text-sm">
              <span className="font-medium text-neutral-900">
                Lot {lot.lotNumber} — {lot.title}
              </span>
              {lot.estimatedAmount ? <span className="ml-2 text-neutral-600">{lot.estimatedAmount}</span> : null}
            </li>
          ))}
        </ul>
      )}
      <form action={formAction} className="flex items-end gap-2">
        <input
          name="lotNumber"
          type="text"
          required
          placeholder="N°"
          className="w-16 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <input
          name="title"
          type="text"
          required
          placeholder="Titre du lot..."
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
        >
          Ajouter
        </button>
        {state.error ? (
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
