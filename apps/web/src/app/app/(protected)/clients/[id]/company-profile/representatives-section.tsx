"use client";

import { useActionState } from "react";
import {
  createRepresentativeAction,
  type FormActionState,
} from "../../../../company-profile-actions";
import {
  REPRESENTATIVE_TYPES,
  REPRESENTATIVE_TYPE_LABELS,
  SATELLITE_STATUS_LABELS,
  type CompanyRepresentative,
} from "../../../../../../lib/company-profile-types";

const INITIAL_STATE: FormActionState = {};

/** Mission §4.3 — aucun signataire ici n'est sélectionné automatiquement pour un Tender : ce sont
 *  des contacts déclarés au niveau entreprise, `SigningPower` (module administratif) reste le seul
 *  pouvoir de signature réel et opposable. */
export function RepresentativesSection({
  clientId,
  representatives,
}: {
  clientId: string;
  representatives: CompanyRepresentative[];
}) {
  const boundAction = createRepresentativeAction.bind(null, clientId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600">
        Représentants légaux, signataires déclarés et contacts. Le pouvoir de signature réel
        d&apos;un appel d&apos;offres reste géré dans le dossier administratif de ce Tender.
      </p>

      {representatives.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun contact enregistré.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Nom</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Fonction</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Statut</th>
              </tr>
            </thead>
            <tbody>
              {representatives.map((representative) => (
                <tr key={representative.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 font-medium text-neutral-900">
                    {representative.firstName} {representative.lastName}
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {REPRESENTATIVE_TYPE_LABELS[representative.type]}
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{representative.jobTitle ?? "—"}</td>
                  <td className="py-2 pr-4 text-neutral-600">{representative.email ?? "—"}</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {SATELLITE_STATUS_LABELS[representative.status] ?? representative.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        action={formAction}
        className="flex flex-col gap-3 rounded border border-neutral-200 p-3"
      >
        <h3 className="text-sm font-semibold text-neutral-900">Ajouter un contact</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="firstName" className="text-xs text-neutral-600">
              Prénom *
            </label>
            <input
              id="firstName"
              name="firstName"
              required
              className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="lastName" className="text-xs text-neutral-600">
              Nom *
            </label>
            <input
              id="lastName"
              name="lastName"
              required
              className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="type" className="text-xs text-neutral-600">
              Type *
            </label>
            <select
              id="type"
              name="type"
              required
              className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
            >
              {REPRESENTATIVE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {REPRESENTATIVE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="jobTitle" className="text-xs text-neutral-600">
              Fonction
            </label>
            <input
              id="jobTitle"
              name="jobTitle"
              className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-xs text-neutral-600">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="phone" className="text-xs text-neutral-600">
              Téléphone
            </label>
            <input
              id="phone"
              name="phone"
              className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="signatureScope" className="text-xs text-neutral-600">
            Périmètre de signature déclaré (si signataire)
          </label>
          <textarea
            id="signatureScope"
            name="signatureScope"
            rows={2}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
        {state.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Ajout..." : "Ajouter"}
        </button>
      </form>
    </div>
  );
}
