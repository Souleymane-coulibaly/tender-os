"use client";

import { useActionState, useState } from "react";
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
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
      >
        Restaurer
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
      <p className="text-sm font-medium text-neutral-800">
        Restaurer cet appel d&apos;offres archive ? Il repassera au statut Brouillon.
      </p>
      <label htmlFor="restore-reason" className="text-xs text-neutral-600">
        Motif (facultatif)
      </label>
      <input id="restore-reason" name="reason" type="text" className="rounded border border-neutral-300 px-2 py-1 text-sm" />
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Restauration..." : "Confirmer la restauration"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="rounded px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">
          Annuler
        </button>
      </div>
    </form>
  );
}
