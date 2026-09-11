"use client";

/**
 * Checkpoint TENDEROS-2.1-CCV2-I.4 — rubrique en LECTURE SEULE.
 *
 * Le formulaire de creation a ete retire : sa route refusait tout depuis CCV2-I.1 et n'existe plus.
 * Cette donnee appartient desormais a `CandidateCompany`. La LISTE reste affichee — des lignes
 * Legacy subsistent chez les clients sans entreprise candidate (registre CCV2-I.2) et rien d'autre
 * ne les montre : les masquer reviendrait a les faire disparaitre du produit.
 */
import { Card } from "../../../../../../components/ui";
import {
  COMPANY_REFERENCE_STATUS_LABELS,
  type CompanyReference,
} from "../../../../../../lib/company-profile-types";

export function ReferencesSection({
  references,
}: {
  clientId: string;
  references: CompanyReference[];
}) {
  return (
    <Card
      title="Références"
      description="Références commerciales — préparées pour un usage futur (mémoire technique, GO/NO-GO), jamais réutilisées automatiquement ce sprint."
    >
      {references.length === 0 ? (
        <p className="text-sm text-tenderos-slate">Aucune référence enregistrée.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-tenderos-navy/10 text-left text-xs font-semibold uppercase tracking-wide text-tenderos-slate">
                <th scope="col" className="py-2 pr-4">Projet</th>
                <th scope="col" className="py-2 pr-4">Client</th>
                <th scope="col" className="py-2 pr-4">Secteur</th>
                <th scope="col" className="py-2 pr-4">Confidentialité</th>
                <th scope="col" className="py-2 pr-4">Statut</th>
              </tr>
            </thead>
            <tbody>
              {references.map((reference) => (
                <tr key={reference.id} className="border-b border-tenderos-navy/10 last:border-0">
                  <td className="py-2 pr-4 font-medium text-tenderos-navy">
                    {reference.projectName}
                  </td>
                  <td className="py-2 pr-4 text-tenderos-slate">
                    {reference.referenceClientName ?? "—"}
                  </td>
                  <td className="py-2 pr-4 text-tenderos-slate">{reference.sector ?? "—"}</td>
                  <td className="py-2 pr-4 text-tenderos-slate">
                    {reference.confidentiality === "CONFIDENTIAL" ? "Confidentielle" : "Standard"}
                  </td>
                  <td className="py-2 pr-4 text-tenderos-slate">
                    {COMPANY_REFERENCE_STATUS_LABELS[reference.status] ?? reference.status}
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
