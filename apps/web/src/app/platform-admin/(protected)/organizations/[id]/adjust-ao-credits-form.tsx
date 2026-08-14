"use client";

import { useActionState } from "react";
import { adjustAoCreditsAction, type AdjustAoCreditsActionState } from "../../../billing-actions";

const INITIAL_STATE: AdjustAoCreditsActionState = {};

/** Mission §48 — "raison obligatoire, ledger, AuditLog". Organization Admin ne peut jamais modifier
 *  son propre solde : ce formulaire n'existe que côté Platform Admin. */
export function AdjustAoCreditsForm({ organizationId }: { organizationId: string }) {
  const boundAction = adjustAoCreditsAction.bind(null, organizationId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
      <h3 className="text-sm font-semibold">Ajustement manuel de crédits AO</h3>
      <div className="flex flex-wrap items-center gap-2">
        <input name="amount" type="number" placeholder="+1 ou -1" required className="w-28 rounded border border-neutral-300 px-2 py-1 text-sm" />
        <input name="reason" type="text" placeholder="Motif (obligatoire)" required className="min-w-[200px] flex-1 rounded border border-neutral-300 px-2 py-1 text-sm" />
      </div>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.success ? <p className="text-xs text-green-700">Ajustement appliqué.</p> : null}
      <button type="submit" disabled={isPending} className="self-start rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Application..." : "Appliquer"}
      </button>
    </form>
  );
}
