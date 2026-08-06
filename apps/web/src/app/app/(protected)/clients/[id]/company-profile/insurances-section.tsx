"use client";

import { useActionState } from "react";
import { createInsuranceAction, type FormActionState } from "../../../../company-profile-actions";
import { INSURANCE_TYPES, INSURANCE_TYPE_LABELS, type CompanyInsurance, type TemporalValidityStatus } from "../../../../../../lib/company-profile-types";

const INITIAL_STATE: FormActionState = {};

const TEMPORAL_LABELS: Record<TemporalValidityStatus, string> = { VALID: "Valide", EXPIRING_SOON: "Bientôt expirée", EXPIRED: "Expirée", NO_EXPIRY: "Sans échéance" };
const TEMPORAL_BADGE: Record<TemporalValidityStatus, string> = {
  VALID: "bg-green-100 text-green-800",
  EXPIRING_SOON: "bg-amber-100 text-amber-800",
  EXPIRED: "bg-red-100 text-red-800",
  NO_EXPIRY: "bg-neutral-200 text-neutral-700",
};

export function InsurancesSection({ clientId, insurances }: { clientId: string; insurances: CompanyInsurance[] }) {
  const boundAction = createInsuranceAction.bind(null, clientId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <div className="flex flex-col gap-4">
      {insurances.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucune assurance enregistrée.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Assureur</th>
                <th className="py-2 pr-4">Échéance</th>
                <th className="py-2 pr-4">Validité</th>
              </tr>
            </thead>
            <tbody>
              {insurances.map((insurance) => (
                <tr key={insurance.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 font-medium text-neutral-900">
                    {insurance.type === "OTHER" ? insurance.otherTypeLabel : INSURANCE_TYPE_LABELS[insurance.type]}
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{insurance.insurer ?? "—"}</td>
                  <td className="py-2 pr-4 text-neutral-600">{insurance.expiresAt ? new Date(insurance.expiresAt).toLocaleDateString("fr-FR") : "—"}</td>
                  <td className="py-2 pr-4">
                    {insurance.temporalStatus ? (
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${TEMPORAL_BADGE[insurance.temporalStatus]}`}>{TEMPORAL_LABELS[insurance.temporalStatus]}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-3 rounded border border-neutral-200 p-3">
        <h3 className="text-sm font-semibold text-neutral-900">Ajouter une assurance</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="type" className="text-xs text-neutral-600">
              Type *
            </label>
            <select id="type" name="type" required className="rounded border border-neutral-300 px-2 py-1.5 text-sm">
              {INSURANCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {INSURANCE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="insurer" className="text-xs text-neutral-600">
              Assureur
            </label>
            <input id="insurer" name="insurer" className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="policyNumber" className="text-xs text-neutral-600">
              N° police
            </label>
            <input id="policyNumber" name="policyNumber" className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="expiresAt" className="text-xs text-neutral-600">
            Date d&apos;échéance
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
