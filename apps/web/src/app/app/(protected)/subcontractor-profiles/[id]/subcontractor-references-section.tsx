"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { archiveSubcontractorReferenceAction, createSubcontractorReferenceAction, type FormActionState } from "../../../subcontractor-actions";
import type { SubcontractorReference } from "../../../../../lib/subcontractor-types";

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
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-neutral-900">Références</h2>
      {active.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucune référence enregistrée.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {active.map((reference) => (
            <li key={reference.id} className="flex items-center justify-between rounded border border-neutral-100 px-3 py-2">
              <span>
                <span className="font-medium text-neutral-900">{reference.projectName}</span>
                {reference.clientName ? <span className="text-neutral-600"> — {reference.clientName}</span> : null}
              </span>
              <button type="button" onClick={() => handleArchive(reference.id)} disabled={archivingId === reference.id} className="text-red-700 hover:underline disabled:opacity-50">
                Archiver
              </button>
            </li>
          ))}
        </ul>
      )}
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="projectName" className="text-xs text-neutral-600">
            Projet *
          </label>
          <input id="projectName" name="projectName" required className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="clientName" className="text-xs text-neutral-600">
            Client
          </label>
          <input id="clientName" name="clientName" className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
        </div>
        <button type="submit" disabled={isPending} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {isPending ? "Ajout..." : "Ajouter"}
        </button>
        {state.error ? (
          <p role="alert" className="w-full text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
