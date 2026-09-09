"use client";

import { useActionState } from "react";
import { changeTenderStatusAction, type FormActionState } from "../../../actions";
import { ALLOWED_TENDER_TRANSITIONS, TENDER_STATUS_LABELS, type TenderStatus } from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};

export function StatusChangeForm({ tenderId, status }: { tenderId: string; status: TenderStatus }) {
  const boundAction = changeTenderStatusAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);
  const nextStatuses = ALLOWED_TENDER_TRANSITIONS[status].filter((next) => next !== "ARCHIVED");

  // V2 Sprint 3 §7/§29 — la restauration (ARCHIVED -> DRAFT) est desormais une transition
  // valide cote domaine, mais reste proposee UNIQUEMENT via le RestoreButton dedie (action et
  // journal d'audit distincts : "tender.restored"), jamais via ce selecteur generique.
  if (status === "ARCHIVED" || nextStatuses.length === 0) {
    return null;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-xs text-neutral-600">
          Changer le statut
        </label>
        <select id="status" name="status" className="rounded border border-neutral-300 px-2 py-1 text-sm">
          {nextStatuses.map((next) => (
            <option key={next} value={next}>
              {TENDER_STATUS_LABELS[next]}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
      >
        {isPending ? "..." : "Appliquer"}
      </button>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
