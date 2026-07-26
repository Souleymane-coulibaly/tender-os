"use client";

import { useActionState, useState } from "react";
import {
  changeChecklistItemStatusAction,
  createChecklistItemAction,
  type FormActionState,
} from "../../../actions";
import type { ChecklistItem, ChecklistItemStatus } from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};
const STATUSES: ChecklistItemStatus[] = ["TODO", "IN_PROGRESS", "COMPLETED", "NOT_APPLICABLE"];

function statusLabel(status: ChecklistItemStatus): string {
  switch (status) {
    case "TODO":
      return "A faire";
    case "IN_PROGRESS":
      return "En cours";
    case "COMPLETED":
      return "Termine";
    case "NOT_APPLICABLE":
      return "Non applicable";
  }
}

function ChecklistItemRow({ tenderId, item }: { tenderId: string; item: ChecklistItem }) {
  const [status, setStatus] = useState(item.status);
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);

  return (
    <li className="flex items-center justify-between gap-3 border-b border-neutral-100 py-2 text-sm">
      <div>
        <span className="font-medium text-neutral-900">{item.title}</span>
        {item.required ? <span className="ml-2 text-xs text-amber-700">obligatoire</span> : null}
        {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
      </div>
      <select
        value={status}
        disabled={isPending}
        onChange={async (event) => {
          const nextStatus = event.target.value as ChecklistItemStatus;
          setIsPending(true);
          setStatus(nextStatus);
          const result = await changeChecklistItemStatusAction(tenderId, item.id, nextStatus);
          setIsPending(false);
          setError(result.error);
        }}
        className="rounded border border-neutral-300 px-2 py-1 text-xs"
      >
        {STATUSES.map((value) => (
          <option key={value} value={value}>
            {statusLabel(value)}
          </option>
        ))}
      </select>
    </li>
  );
}

export function ChecklistSection({ tenderId, items }: { tenderId: string; items: ChecklistItem[] }) {
  const boundAction = createChecklistItemAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-700">Checklist</h2>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucun element de checklist.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <ChecklistItemRow key={item.id} tenderId={tenderId} item={item} />
          ))}
        </ul>
      )}
      <form action={formAction} className="flex items-end gap-2">
        <input
          name="title"
          type="text"
          required
          placeholder="Nouvel element..."
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <label className="flex items-center gap-1 text-xs text-neutral-600">
          <input name="required" type="checkbox" /> obligatoire
        </label>
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
