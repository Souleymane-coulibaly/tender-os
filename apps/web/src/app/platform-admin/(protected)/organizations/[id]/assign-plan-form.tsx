"use client";

import { useActionState } from "react";
import { assignPlanAction, type AssignPlanActionState } from "../../../billing-actions";

const INITIAL_STATE: AssignPlanActionState = {};

/**
 * V2 Sprint 22 (billing, étape 22D) — mission §49 "MANUAL/GRANTED pour pilotes/démos". `STRIPE`
 * n'apparaît jamais dans ce formulaire : cette source est réservée exclusivement au webhook Stripe
 * (backend refuse `.strict()` toute autre valeur que MANUAL/GRANTED sur cette route).
 */
export function AssignPlanForm({ organizationId }: { organizationId: string }) {
  const boundAction = assignPlanAction.bind(null, organizationId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
      <h3 className="text-sm font-semibold">Assigner un plan (MANUAL/GRANTED)</h3>
      <div className="flex flex-wrap gap-2">
        <select name="planTier" defaultValue="STARTER" className="rounded border border-neutral-300 px-2 py-1 text-sm">
          <option value="STARTER">Starter</option>
          <option value="BUSINESS">Business</option>
          <option value="ENTERPRISE">Enterprise</option>
        </select>
        <select name="billingInterval" defaultValue="MONTHLY" className="rounded border border-neutral-300 px-2 py-1 text-sm">
          <option value="MONTHLY">Mensuel</option>
          <option value="YEARLY">Annuel</option>
        </select>
        <select name="source" defaultValue="GRANTED" className="rounded border border-neutral-300 px-2 py-1 text-sm">
          <option value="GRANTED">Offert (pilote/démo)</option>
          <option value="MANUAL">Manuel (paiement hors Stripe)</option>
        </select>
      </div>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.success ? <p className="text-xs text-green-700">Plan assigné.</p> : null}
      <button type="submit" disabled={isPending} className="self-start rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Assignation..." : "Assigner"}
      </button>
    </form>
  );
}
