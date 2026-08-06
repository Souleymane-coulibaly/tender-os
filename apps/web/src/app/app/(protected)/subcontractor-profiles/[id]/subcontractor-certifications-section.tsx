"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { archiveSubcontractorCertificationAction, createSubcontractorCertificationAction, type FormActionState } from "../../../subcontractor-actions";
import type { SubcontractorCertification } from "../../../../../lib/subcontractor-types";

const INITIAL_STATE: FormActionState = {};

export function SubcontractorCertificationsSection({ subcontractorId, certifications }: { subcontractorId: string; certifications: SubcontractorCertification[] }) {
  const router = useRouter();
  const boundAction = createSubcontractorCertificationAction.bind(null, subcontractorId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);
  const [archivingId, setArchivingId] = useState<string | undefined>();

  async function handleArchive(certificationId: string) {
    setArchivingId(certificationId);
    const result = await archiveSubcontractorCertificationAction(subcontractorId, certificationId);
    setArchivingId(undefined);
    if (!result.error) router.refresh();
  }

  const active = certifications.filter((certification) => certification.status !== "ARCHIVED");

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-neutral-900">Certifications</h2>
      {active.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucune certification enregistrée.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {active.map((certification) => (
            <li key={certification.id} className="flex items-center justify-between rounded border border-neutral-100 px-3 py-2">
              <span>
                <span className="font-medium text-neutral-900">{certification.name}</span>
                {certification.issuer ? <span className="text-neutral-600"> — {certification.issuer}</span> : null}
                {certification.expiresAt ? <span className="text-neutral-500"> (jusqu&apos;au {new Date(certification.expiresAt).toLocaleDateString("fr-FR")})</span> : null}
              </span>
              <button type="button" onClick={() => handleArchive(certification.id)} disabled={archivingId === certification.id} className="text-red-700 hover:underline disabled:opacity-50">
                Archiver
              </button>
            </li>
          ))}
        </ul>
      )}
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-xs text-neutral-600">
            Nom *
          </label>
          <input id="name" name="name" required className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="issuer" className="text-xs text-neutral-600">
            Organisme
          </label>
          <input id="issuer" name="issuer" className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="expiresAt" className="text-xs text-neutral-600">
            Échéance
          </label>
          <input id="expiresAt" name="expiresAt" type="date" className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
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
