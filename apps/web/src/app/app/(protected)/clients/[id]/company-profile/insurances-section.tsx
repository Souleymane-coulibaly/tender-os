"use client";

/**
 * Checkpoint TENDEROS-2.1-CCV2-I.4 — rubrique en LECTURE SEULE.
 *
 * Le formulaire de creation a ete retire : sa route refusait tout depuis CCV2-I.1 et n'existe plus.
 * Cette donnee appartient desormais a `CandidateCompany`. La LISTE reste affichee — des lignes
 * Legacy subsistent chez les clients sans entreprise candidate (registre CCV2-I.2) et rien d'autre
 * ne les montre : les masquer reviendrait a les faire disparaitre du produit.
 */
import { INSURANCE_TYPE_LABELS, TEMPORAL_VALIDITY_LABELS, temporalValidityTone, type CompanyInsurance } from "../../../../../../lib/company-profile-types";
import { Badge } from "../../../../../../components/ui";


export function InsurancesSection({ insurances }: { clientId: string; insurances: CompanyInsurance[] }) {

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
                      <Badge tone={temporalValidityTone(insurance.temporalStatus)}>{TEMPORAL_VALIDITY_LABELS[insurance.temporalStatus]}</Badge>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
