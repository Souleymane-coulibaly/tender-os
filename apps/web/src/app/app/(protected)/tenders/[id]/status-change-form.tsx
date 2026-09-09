"use client";

import { useActionState } from "react";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import { Select } from "../../../../../components/ui/select";
import { changeTenderStatusAction, type FormActionState } from "../../../actions";
import {
  ALLOWED_TENDER_TRANSITIONS,
  TENDER_STATUS_LABELS,
  type TenderStatus,
} from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};

export function StatusChangeForm({ tenderId, status }: { tenderId: string; status: TenderStatus }) {
  const boundAction = changeTenderStatusAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);
  const nextStatuses = ALLOWED_TENDER_TRANSITIONS[status].filter((next) => next !== "ARCHIVED");

  // V2 Sprint 3 §7/§29 — la restauration (ARCHIVED -> DRAFT) est desormais une transition
  // valide cote domaine, mais reste proposee UNIQUEMENT via le RestoreButton dedie (action et
  // journal d'audit distincts : "tender.restored"), jamais via ce selecteur generique.
  if (status === "ARCHIVED" || nextStatuses.length === 0) {
    return null;
  }

  return (
    <Card>
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <Select name="status" label="Changer le statut" wrapperClassName="min-w-[12rem] flex-1">
          {nextStatuses.map((next) => (
            <option key={next} value={next}>
              {TENDER_STATUS_LABELS[next]}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="primary" size="sm" loading={isPending}>
          Appliquer
        </Button>
        {state.error ? (
          <p role="alert" className="text-xs text-danger-fg">
            {state.error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
