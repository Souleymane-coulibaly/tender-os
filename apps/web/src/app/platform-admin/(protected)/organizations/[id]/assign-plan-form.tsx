"use client";

import { useActionState } from "react";
import { Button, Card, Select } from "../../../../../components/ui";
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
    <Card title="Assigner un plan (MANUAL/GRANTED)">
      <form action={formAction} className="flex flex-col gap-3">
        {/* `Select` sans label rend le contrôle nu : la largeur est portée par chaque conteneur. */}
        <div className="flex flex-wrap gap-2">
          <div className="w-full sm:w-48">
            <Select name="planTier" defaultValue="STARTER">
              <option value="STARTER">Starter</option>
              <option value="BUSINESS">Business</option>
              <option value="ENTERPRISE">Enterprise</option>
            </Select>
          </div>
          <div className="w-full sm:w-48">
            <Select name="billingInterval" defaultValue="MONTHLY">
              <option value="MONTHLY">Mensuel</option>
              <option value="YEARLY">Annuel</option>
            </Select>
          </div>
          <div className="w-full sm:w-64">
            <Select name="source" defaultValue="GRANTED">
              <option value="GRANTED">Offert (pilote/démo)</option>
              <option value="MANUAL">Manuel (paiement hors Stripe)</option>
            </Select>
          </div>
        </div>
        {state.error ? (
          <p role="alert" className="text-xs text-danger-fg">
            {state.error}
          </p>
        ) : null}
        {state.success ? <p className="text-xs text-success-fg">Plan assigné.</p> : null}
        <Button type="submit" disabled={isPending} className="self-start">
          {isPending ? "Assignation..." : "Assigner"}
        </Button>
      </form>
    </Card>
  );
}
