"use client";

import { useActionState } from "react";
import { createCertificationAction, type FormActionState } from "../../../../company-profile-actions";
import { TEMPORAL_VALIDITY_LABELS, temporalValidityTone, type CompanyCertification } from "../../../../../../lib/company-profile-types";
import { Badge } from "../../../../../../components/ui";

const INITIAL_STATE: FormActionState = {};

export function CertificationsSection({ clientId, certifications }: { clientId: string; certifications: CompanyCertification[] }) {
  const boundAction = createCertificationAction.bind(null, clientId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <div className="flex flex-col gap-4">
      {certifications.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucune certification enregistrée. Mission §4.6 : une certification sans échéance est acceptée.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Nom</th>
                <th className="py-2 pr-4">Organisme</th>
                <th className="py-2 pr-4">Échéance</th>
                <th className="py-2 pr-4">Validité</th>
              </tr>
            </thead>
            <tbody>
              {certifications.map((certification) => (
                <tr key={certification.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 font-medium text-neutral-900">{certification.name}</td>
                  <td className="py-2 pr-4 text-neutral-600">{certification.issuer ?? "—"}</td>
                  <td className="py-2 pr-4 text-neutral-600">{certification.expiresAt ? new Date(certification.expiresAt).toLocaleDateString("fr-FR") : "—"}</td>
                  <td className="py-2 pr-4">
                    {certification.temporalStatus ? (
                      <Badge tone={temporalValidityTone(certification.temporalStatus)}>{TEMPORAL_VALIDITY_LABELS[certification.temporalStatus]}</Badge>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-3 rounded border border-neutral-200 p-3">
        <h3 className="text-sm font-semibold text-neutral-900">Ajouter une certification</h3>
        <div className="grid grid-cols-3 gap-3">
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
            <label htmlFor="number" className="text-xs text-neutral-600">
              N° certificat
            </label>
            <input id="number" name="number" className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="expiresAt" className="text-xs text-neutral-600">
            Date d&apos;échéance (facultative)
          </label>
          <input id="expiresAt" name="expiresAt" type="date" className="w-48 rounded border border-neutral-300 px-2 py-1.5 text-sm" />
        </div>
        {state.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
        <button type="submit" disabled={isPending} className="self-start rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {isPending ? "Ajout..." : "Ajouter"}
        </button>
      </form>
    </div>
  );
}
