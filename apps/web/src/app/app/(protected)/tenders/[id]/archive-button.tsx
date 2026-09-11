"use client";

import { useActionState, useState } from "react";
import { Button } from "../../../../../components/ui/button";
import { Input } from "../../../../../components/ui/input";
import { archiveTenderAction, type FormActionState } from "../../../actions";

const INITIAL_STATE: FormActionState = {};

export function ArchiveButton({ tenderId }: { tenderId: string }) {
  const [confirming, setConfirming] = useState(false);
  const boundAction = archiveTenderAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  if (!confirming) {
    return (
      <Button type="button" variant="danger" size="sm" onClick={() => setConfirming(true)}>
        Archiver
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-lg bg-danger-bg p-3"
    >
      <p className="text-sm font-medium text-danger-fg">
        Confirmer l&apos;archivage de cet appel d&apos;offres ? Il ne pourra plus etre modifie
        normalement.
      </p>
      <Input name="reason" type="text" label="Motif (facultatif)" />
      {state.error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" size="sm" loading={isPending}>
          Confirmer l&apos;archivage
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
