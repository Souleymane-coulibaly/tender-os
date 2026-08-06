"use client";

import { useActionState } from "react";
import { createReferenceAction, type FormActionState } from "../../../../company-profile-actions";
import type { CompanyReference } from "../../../../../../lib/company-profile-types";

const INITIAL_STATE: FormActionState = {};

export function ReferencesSection({ clientId, references }: { clientId: string; references: CompanyReference[] }) {
  const boundAction = createReferenceAction.bind(null, clientId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600">Références commerciales — préparées pour un usage futur (mémoire technique, GO/NO-GO), jamais réutilisées automatiquement ce sprint.</p>

      {references.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucune référence enregistrée.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Projet</th>
                <th className="py-2 pr-4">Client</th>
                <th className="py-2 pr-4">Secteur</th>
                <th className="py-2 pr-4">Confidentialité</th>
                <th className="py-2 pr-4">Statut</th>
              </tr>
            </thead>
            <tbody>
              {references.map((reference) => (
                <tr key={reference.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 font-medium text-neutral-900">{reference.projectName}</td>
                  <td className="py-2 pr-4 text-neutral-600">{reference.referenceClientName ?? "—"}</td>
                  <td className="py-2 pr-4 text-neutral-600">{reference.sector ?? "—"}</td>
                  <td className="py-2 pr-4 text-neutral-600">{reference.confidentiality === "CONFIDENTIAL" ? "Confidentielle" : "Standard"}</td>
                  <td className="py-2 pr-4 text-neutral-600">{reference.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-3 rounded border border-neutral-200 p-3">
        <h3 className="text-sm font-semibold text-neutral-900">Ajouter une référence</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="projectName" className="text-xs text-neutral-600">
              Nom du projet *
            </label>
            <input id="projectName" name="projectName" required className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="referenceClientName" className="text-xs text-neutral-600">
              Client
            </label>
            <input id="referenceClientName" name="referenceClientName" className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="sector" className="text-xs text-neutral-600">
              Secteur
            </label>
            <input id="sector" name="sector" className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="amountValue" className="text-xs text-neutral-600">
              Montant
            </label>
            <input id="amountValue" name="amountValue" inputMode="decimal" className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="confidentiality" className="text-xs text-neutral-600">
              Confidentialité
            </label>
            <select id="confidentiality" name="confidentiality" defaultValue="STANDARD" className="rounded border border-neutral-300 px-2 py-1.5 text-sm">
              <option value="STANDARD">Standard</option>
              <option value="CONFIDENTIAL">Confidentielle</option>
            </select>
          </div>
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
