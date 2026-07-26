"use client";

import { useActionState, useState } from "react";
import { createMilestoneAction, markMilestoneDoneAction, type FormActionState } from "../../../actions";
import type { Milestone, MilestoneType } from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};
const TYPES: MilestoneType[] = [
  "SUBMISSION_DEADLINE",
  "QUESTION_DEADLINE",
  "MANDATORY_VISIT",
  "INTERNAL_VALIDATION",
  "CUSTOM",
];

function MilestoneRow({ tenderId, milestone }: { tenderId: string; milestone: Milestone }) {
  const [done, setDone] = useState(milestone.status === "DONE");
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);

  return (
    <li className="flex items-center justify-between gap-3 border-b border-neutral-100 py-2 text-sm">
      <div>
        <span className="font-medium text-neutral-900">{milestone.title}</span>
        <span className="ml-2 text-neutral-600">{new Date(milestone.date).toLocaleDateString("fr-FR")}</span>
        {done ? (
          <span className="ml-2 text-xs text-green-700">fait</span>
        ) : milestone.overdue ? (
          <span className="ml-2 text-xs text-red-700">en retard</span>
        ) : null}
        {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
      </div>
      {!done ? (
        <button
          type="button"
          disabled={isPending}
          onClick={async () => {
            setIsPending(true);
            const result = await markMilestoneDoneAction(tenderId, milestone.id);
            setIsPending(false);
            if (result.error) {
              setError(result.error);
            } else {
              setDone(true);
            }
          }}
          className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50"
        >
          {isPending ? "..." : "Marquer fait"}
        </button>
      ) : null}
    </li>
  );
}

export function MilestonesSection({ tenderId, milestones }: { tenderId: string; milestones: Milestone[] }) {
  const boundAction = createMilestoneAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-700">Echeances</h2>
      {milestones.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucune echeance.</p>
      ) : (
        <ul>
          {milestones.map((milestone) => (
            <MilestoneRow key={milestone.id} tenderId={tenderId} milestone={milestone} />
          ))}
        </ul>
      )}
      <form action={formAction} className="flex items-end gap-2">
        <input
          name="title"
          type="text"
          required
          placeholder="Titre..."
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <input name="date" type="date" required className="rounded border border-neutral-300 px-2 py-1 text-sm" />
        <select name="type" defaultValue="CUSTOM" className="rounded border border-neutral-300 px-2 py-1 text-sm">
          {TYPES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
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
