"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { changeOpportunityStatusAction } from "../../../opportunity-actions";
import { ALLOWED_OPPORTUNITY_MANUAL_TRANSITIONS, OPPORTUNITY_STATUS_LABELS, type OpportunityStatus } from "../../../../../lib/opportunity-types";

/** Funnel amont uniquement (DRAFT/TO_QUALIFY/QUALIFIED/DISMISSED) — GO/GO_CONDITIONAL/NO_GO ne
 *  sont jamais proposés ici, uniquement via la section Décision GO/NO-GO. */
export function OpportunityStatusForm({ opportunityId, status }: { opportunityId: string; status: OpportunityStatus }) {
  const router = useRouter();
  const nextStatuses = ALLOWED_OPPORTUNITY_MANUAL_TRANSITIONS[status] ?? [];
  const [selected, setSelected] = useState<OpportunityStatus | undefined>(nextStatuses[0]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (nextStatuses.length === 0) {
    return null;
  }

  async function handleSubmit(): Promise<void> {
    if (!selected) return;
    setIsPending(true);
    setError(undefined);
    const state = await changeOpportunityStatusAction(opportunityId, selected);
    if (state.error) {
      setError(state.error);
      setIsPending(false);
      return;
    }
    setIsPending(false);
    // Rendu du badge de statut (page parente, serveur) — sans ce rafraîchissement, resterait
    // périmé jusqu'au prochain rechargement manuel (même motif que OpportunityDecisionSection).
    router.refresh();
  }

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="opportunity-status" className="text-xs text-neutral-600">
          Changer le statut
        </label>
        <select id="opportunity-status" value={selected} onChange={(e) => setSelected(e.target.value as OpportunityStatus)} className="rounded border border-neutral-300 px-2 py-1 text-sm">
          {nextStatuses.map((next) => (
            <option key={next} value={next}>
              {OPPORTUNITY_STATUS_LABELS[next]}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={isPending} className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50">
        {isPending ? "…" : "Appliquer"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </form>
  );
}
