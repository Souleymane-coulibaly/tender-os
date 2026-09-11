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
import { Badge, Card } from "../../../../../../components/ui";


export function InsurancesSection({ insurances }: { clientId: string; insurances: CompanyInsurance[] }) {

  return (
    <Card title="Assurances">
      {insurances.length === 0 ? (
        <p className="text-sm text-tenderos-slate">Aucune assurance enregistrée.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-tenderos-navy/10 text-left text-xs font-semibold uppercase tracking-wide text-tenderos-slate">
                <th scope="col" className="py-2 pr-4">Type</th>
                <th scope="col" className="py-2 pr-4">Assureur</th>
                <th scope="col" className="py-2 pr-4">Échéance</th>
                <th scope="col" className="py-2 pr-4">Validité</th>
              </tr>
            </thead>
            <tbody>
              {insurances.map((insurance) => (
                <tr key={insurance.id} className="border-b border-tenderos-navy/10 last:border-0">
                  <td className="py-2 pr-4 font-medium text-tenderos-navy">
                    {insurance.type === "OTHER" ? insurance.otherTypeLabel : INSURANCE_TYPE_LABELS[insurance.type]}
                  </td>
                  <td className="py-2 pr-4 text-tenderos-slate">{insurance.insurer ?? "—"}</td>
                  <td className="py-2 pr-4 text-tenderos-slate">{insurance.expiresAt ? new Date(insurance.expiresAt).toLocaleDateString("fr-FR") : "—"}</td>
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
    </Card>
  );
}
