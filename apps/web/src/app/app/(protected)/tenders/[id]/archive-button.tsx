"use client";

import { useActionState, useState } from "react";
import { archiveTenderAction, type FormActionState } from "../../../actions";

const INITIAL_STATE: FormActionState = {};

export function ArchiveButton({ tenderId }: { tenderId: string }) {
  const [confirming, setConfirming] = useState(false);
  const boundAction = archiveTenderAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        Archiver
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-red-200 p-3">
      <p className="text-sm font-medium text-red-800">
        Confirmer l&apos;archivage de cet appel d&apos;offres ? Il ne pourra plus etre modifie normalement.
      </p>
      <label htmlFor="reason" className="text-xs text-neutral-600">
        Motif (facultatif)
      </label>
      <input id="reason" name="reason" type="text" className="rounded border border-neutral-300 px-2 py-1 text-sm" />
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Archivage..." : "Confirmer l'archivage"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
