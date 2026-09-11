"use client";

import { useActionState } from "react";
import { Button, Card, Input } from "../../../../../components/ui";
import { adjustAoCreditsAction, type AdjustAoCreditsActionState } from "../../../billing-actions";

const INITIAL_STATE: AdjustAoCreditsActionState = {};

/** Mission §48 — "raison obligatoire, ledger, AuditLog". Organization Admin ne peut jamais modifier
 *  son propre solde : ce formulaire n'existe que côté Platform Admin. */
export function AdjustAoCreditsForm({ organizationId }: { organizationId: string }) {
  const boundAction = adjustAoCreditsAction.bind(null, organizationId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <Card title="Ajustement manuel de crédits AO">
      <form action={formAction} className="flex flex-col gap-3">
        {/* `Input` sans label rend le contrôle nu : la largeur est portée par chaque conteneur. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-28">
            <Input name="amount" type="number" placeholder="+1 ou -1" required />
          </div>
          <div className="min-w-[200px] flex-1">
            <Input name="reason" type="text" placeholder="Motif (obligatoire)" required />
          </div>
        </div>
        {state.error ? (
          <p role="alert" className="text-xs text-danger-fg">
            {state.error}
          </p>
        ) : null}
        {state.success ? <p className="text-xs text-success-fg">Ajustement appliqué.</p> : null}
        <Button type="submit" disabled={isPending} className="self-start">
          {isPending ? "Application..." : "Appliquer"}
        </Button>
      </form>
    </Card>
  );
}
