"use client";

import { useActionState, useState } from "react";
import { Button } from "../../../../../components/ui/button";
import { Input } from "../../../../../components/ui/input";
import { restoreTenderAction, type FormActionState } from "../../../actions";

const INITIAL_STATE: FormActionState = {};

/** Correctif V2 Sprint 3 §7/§29 — avant ce sprint, un Tender archive etait irrecuperable
 *  (ARCHIVED etait un etat terminal sans transition sortante). Restaure toujours vers DRAFT. */
export function RestoreButton({ tenderId }: { tenderId: string }) {
  const [confirming, setConfirming] = useState(false);
  const boundAction = restoreTenderAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  if (!confirming) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(true)}>
        Restaurer
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-lg border border-tenderos-navy/10 p-3"
    >
      <p className="text-sm font-medium text-tenderos-navy">
        Restaurer cet appel d&apos;offres archive ? Il repassera au statut Brouillon.
      </p>
      <Input name="reason" type="text" label="Motif (facultatif)" />
      {state.error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm" loading={isPending}>
          Confirmer la restauration
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
