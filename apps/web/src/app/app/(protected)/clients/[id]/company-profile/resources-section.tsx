"use client";

/**
 * Checkpoint TENDEROS-2.1-CCV2-I.4 — rubrique en LECTURE SEULE.
 *
 * Le formulaire de creation a ete retire : sa route refusait tout depuis CCV2-I.1 et n'existe plus.
 * Cette donnee appartient desormais a `CandidateCompany`. La LISTE reste affichee — des lignes
 * Legacy subsistent chez les clients sans entreprise candidate (registre CCV2-I.2) et rien d'autre
 * ne les montre : les masquer reviendrait a les faire disparaitre du produit.
 */
import type { CompanyHumanResource, CompanyMaterialResource } from "../../../../../../lib/company-profile-types";


export function ResourcesSection({
  clientId,
  humanResources,
  materialResources,
}: {
  clientId: string;
  humanResources: CompanyHumanResource[];
  materialResources: CompanyMaterialResource[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <HumanResourcesBlock clientId={clientId} resources={humanResources} />
      <MaterialResourcesBlock clientId={clientId} resources={materialResources} />
    </div>
  );
}

function HumanResourcesBlock({ resources }: { clientId: string; resources: CompanyHumanResource[] }) {

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-neutral-900">Moyens humains</h3>
      {resources.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun moyen humain enregistré.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Catégorie</th>
                <th className="py-2 pr-4">Intitulé</th>
                <th className="py-2 pr-4">Effectif</th>
                <th className="py-2 pr-4">Qualification</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => (
                <tr key={resource.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 text-neutral-600">{resource.category}</td>
                  <td className="py-2 pr-4 font-medium text-neutral-900">{resource.title}</td>
                  <td className="py-2 pr-4 text-neutral-600">{resource.headcount}</td>
                  <td className="py-2 pr-4 text-neutral-600">{resource.qualification ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MaterialResourcesBlock({ resources }: { clientId: string; resources: CompanyMaterialResource[] }) {

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-neutral-900">Moyens matériels</h3>
      {resources.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun moyen matériel enregistré.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Catégorie</th>
                <th className="py-2 pr-4">Nom</th>
                <th className="py-2 pr-4">Quantité</th>
                <th className="py-2 pr-4">Disponibilité</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => (
                <tr key={resource.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 text-neutral-600">{resource.category}</td>
                  <td className="py-2 pr-4 font-medium text-neutral-900">{resource.name}</td>
                  <td className="py-2 pr-4 text-neutral-600">{resource.quantity}</td>
                  <td className="py-2 pr-4 text-neutral-600">{resource.availabilityStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
