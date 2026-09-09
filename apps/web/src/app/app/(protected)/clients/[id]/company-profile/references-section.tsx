"use client";

/**
 * Checkpoint TENDEROS-2.1-CCV2-I.4 — rubrique en LECTURE SEULE.
 *
 * Le formulaire de creation a ete retire : sa route refusait tout depuis CCV2-I.1 et n'existe plus.
 * Cette donnee appartient desormais a `CandidateCompany`. La LISTE reste affichee — des lignes
 * Legacy subsistent chez les clients sans entreprise candidate (registre CCV2-I.2) et rien d'autre
 * ne les montre : les masquer reviendrait a les faire disparaitre du produit.
 */
import type { CompanyReference } from "../../../../../../lib/company-profile-types";


export function ReferencesSection({ references }: { clientId: string; references: CompanyReference[] }) {

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
    </div>
  );
}
