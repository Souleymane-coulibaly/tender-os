"use client";

/**
 * Checkpoint TENDEROS-2.1-CCV2-I.4 — rubrique en LECTURE SEULE.
 *
 * Le formulaire de creation a ete retire : sa route refusait tout depuis CCV2-I.1 et n'existe plus.
 * Cette donnee appartient desormais a `CandidateCompany`. La LISTE reste affichee — des lignes
 * Legacy subsistent chez les clients sans entreprise candidate (registre CCV2-I.2) et rien d'autre
 * ne les montre : les masquer reviendrait a les faire disparaitre du produit.
 */
import { TEMPORAL_VALIDITY_LABELS, temporalValidityTone, type CompanyCertification } from "../../../../../../lib/company-profile-types";
import { Badge } from "../../../../../../components/ui";


export function CertificationsSection({ certifications }: { clientId: string; certifications: CompanyCertification[] }) {

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
    </div>
  );
}
