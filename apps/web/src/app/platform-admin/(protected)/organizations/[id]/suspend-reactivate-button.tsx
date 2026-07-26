"use client";

import { useActionState, useState } from "react";
import { reactivateOrganizationAction, suspendOrganizationAction, type SuspendActionState } from "../../../actions";

const INITIAL_STATE: SuspendActionState = {};

export function SuspendReactivateButton({
  organizationId,
  status,
}: {
  organizationId: string;
  status: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const boundSuspendAction = suspendOrganizationAction.bind(null, organizationId);
  const [suspendState, suspendFormAction, isSuspendPending] = useActionState(boundSuspendAction, INITIAL_STATE);

  if (status === "SUSPENDED") {
    return <ReactivateButton organizationId={organizationId} />;
  }

  if (status === "CLOSED") {
    return null;
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        Suspendre
      </button>
    );
  }

  return (
    <form action={suspendFormAction} className="flex flex-col gap-2 rounded border border-red-200 p-3">
      <p className="text-sm font-medium text-red-800">
        Confirmer la suspension de cette organisation ? Ses membres perdront immédiatement l&apos;accès.
        L&apos;action est réversible.
      </p>
      <label htmlFor="reason" className="text-xs text-neutral-600">
        Motif (facultatif)
      </label>
      <input id="reason" name="reason" type="text" className="rounded border border-neutral-300 px-2 py-1 text-sm" />
      {suspendState.error ? (
        <p role="alert" className="text-xs text-red-600">
          {suspendState.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSuspendPending}
          className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isSuspendPending ? "Suspension..." : "Confirmer la suspension"}
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

function ReactivateButton({ organizationId }: { organizationId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded border border-green-300 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50"
      >
        Réactiver
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-green-200 p-3">
      <p className="text-sm font-medium text-green-800">Confirmer la réactivation de cette organisation ?</p>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={async () => {
            setIsPending(true);
            const result = await reactivateOrganizationAction(organizationId);
            setIsPending(false);
            if (result.error) {
              setError(result.error);
            } else {
              setConfirming(false);
            }
          }}
          className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Réactivation..." : "Confirmer la réactivation"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
