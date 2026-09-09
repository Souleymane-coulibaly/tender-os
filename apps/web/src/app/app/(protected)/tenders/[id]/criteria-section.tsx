"use client";

import { useActionState } from "react";
import { createAwardCriterionAction, type FormActionState } from "../../../actions";
import type { AwardCriterion } from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};

export function CriteriaSection({ tenderId, criteria }: { tenderId: string; criteria: AwardCriterion[] }) {
  const boundAction = createAwardCriterionAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);
  const totalWeight = criteria.reduce((sum, criterion) => sum + Number(criterion.weight), 0);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-700">
        Criteres d&apos;attribution {criteria.length > 0 ? `(total ${totalWeight}%)` : null}
      </h2>
      {criteria.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucun critere renseigne.</p>
      ) : (
        <ul>
          {criteria.map((criterion) => (
            <li key={criterion.id} className="border-b border-neutral-100 py-2 text-sm">
              <span className="font-medium text-neutral-900">{criterion.name}</span>
              <span className="ml-2 text-neutral-600">{criterion.weight}%</span>
            </li>
          ))}
        </ul>
      )}
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input
          name="name"
          type="text"
          required
          placeholder="Nom du critere..."
          className="min-w-[10rem] flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <input
          name="weight"
          type="text"
          required
          placeholder="Poids %"
          inputMode="decimal"
          className="w-20 rounded border border-neutral-300 px-2 py-1 text-sm"
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
