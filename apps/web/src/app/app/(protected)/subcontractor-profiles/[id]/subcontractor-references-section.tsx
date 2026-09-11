"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { archiveSubcontractorReferenceAction, createSubcontractorReferenceAction, type FormActionState } from "../../../subcontractor-actions";
import type { SubcontractorReference } from "../../../../../lib/subcontractor-types";
import { Button, Card, FieldWrapper, Input } from "../../../../../components/ui";

const INITIAL_STATE: FormActionState = {};

export function SubcontractorReferencesSection({ subcontractorId, references }: { subcontractorId: string; references: SubcontractorReference[] }) {
  const router = useRouter();
  const boundAction = createSubcontractorReferenceAction.bind(null, subcontractorId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);
  const [archivingId, setArchivingId] = useState<string | undefined>();

  async function handleArchive(referenceId: string) {
    setArchivingId(referenceId);
    const result = await archiveSubcontractorReferenceAction(subcontractorId, referenceId);
    setArchivingId(undefined);
    if (!result.error) router.refresh();
  }

  const active = references.filter((reference) => reference.status !== "ARCHIVED");

  return (
    <Card title="Références">
      <div className="flex flex-col gap-4">
        {active.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucune référence enregistrée.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {active.map((reference) => (
              <li key={reference.id} className="flex items-center justify-between gap-3 rounded-lg border border-tenderos-navy/10 px-3 py-2">
                <span>
                  <span className="font-medium text-tenderos-navy">{reference.projectName}</span>
                  {reference.clientName ? <span className="text-tenderos-slate"> — {reference.clientName}</span> : null}
                </span>
                <Button type="button" variant="danger" size="sm" onClick={() => handleArchive(reference.id)} disabled={archivingId === reference.id} className="shrink-0">
                  Archiver
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <FieldWrapper label="Projet *" className="basis-48">
            <Input id="projectName" name="projectName" required />
          </FieldWrapper>
          <Input label="Client" id="clientName" name="clientName" wrapperClassName="basis-48" />
          <Button type="submit" disabled={isPending}>
            {isPending ? "Ajout..." : "Ajouter"}
          </Button>
          {state.error ? (
            <p role="alert" className="w-full text-sm text-danger-fg">
              {state.error}
            </p>
          ) : null}
        </form>
      </div>
    </Card>
  );
}
