"use client";

import { useActionState, useState } from "react";
import { Button, Input } from "../../../../../components/ui";
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
      <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
        Suspendre
      </Button>
    );
  }

  return (
    <form action={suspendFormAction} className="flex max-w-sm flex-col gap-2 rounded-lg bg-danger-bg p-3">
      <p className="text-sm font-medium text-danger-fg">
        Confirmer la suspension de cette organisation ? Ses membres perdront immédiatement l&apos;accès.
        L&apos;action est réversible.
      </p>
      <Input label="Motif (facultatif)" id="reason" name="reason" type="text" />
      {suspendState.error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {suspendState.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" size="sm" disabled={isSuspendPending}>
          {isSuspendPending ? "Suspension..." : "Confirmer la suspension"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Annuler
        </Button>
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
      <Button type="button" onClick={() => setConfirming(true)}>
        Réactiver
      </Button>
    );
  }

  return (
    <div className="flex max-w-sm flex-col gap-2 rounded-lg bg-success-bg p-3">
      <p className="text-sm font-medium text-success-fg">Confirmer la réactivation de cette organisation ?</p>
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
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
        >
          {isPending ? "Réactivation..." : "Confirmer la réactivation"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
