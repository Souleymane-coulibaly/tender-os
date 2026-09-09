import type { CompanyLegalIdentity } from "../../../../../../lib/company-profile-types";

/**
 * Checkpoint TENDEROS-2.1-CCV2-I.4 — rubrique d'identité juridique en LECTURE SEULE.
 *
 * Cette section était un formulaire d'édition. Sa route d'écriture (`PATCH
 * /clients/:id/legal-identity`) refusait tout depuis CCV2-I.1 et a été RETIRÉE en I.4 : l'identité
 * juridique du candidat appartient à `CandidateCompany`. Conserver des champs de saisie n'aurait
 * proposé qu'une action impossible.
 *
 * La rubrique n'est pas supprimée pour autant : des lignes Legacy subsistent chez les clients sans
 * entreprise candidate (registre de migration CCV2-I.2), et rien d'autre ne les affiche. Les retirer
 * de l'écran rendrait cette donnée inaccessible depuis le produit — ce que le décommissionnement ne
 * doit jamais faire.
 *
 * Devenu un composant serveur : sans état de formulaire ni action, `"use client"` n'a plus d'objet.
 */
export function LegalIdentitySection({ legalIdentity }: { legalIdentity: CompanyLegalIdentity | null }) {
  if (!legalIdentity) {
    return <p className="text-sm text-neutral-600">Aucune identité juridique historique pour ce client.</p>;
  }

  return (
    <dl className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      <ReadOnlyField label="Raison sociale" value={legalIdentity.legalName} />
      <ReadOnlyField label="Nom commercial" value={legalIdentity.tradeName} />
      <ReadOnlyField label="SIREN" value={legalIdentity.siren} />
      <ReadOnlyField label="SIRET (siège)" value={legalIdentity.siretPrincipal} />
      <ReadOnlyField label="N° TVA intracommunautaire" value={legalIdentity.vatNumber} />
      <ReadOnlyField label="Forme juridique" value={legalIdentity.legalForm} />
      <ReadOnlyField label="Code APE/NAF" value={legalIdentity.apeCode} />
      <ReadOnlyField label="Adresse" value={legalIdentity.addressLine} />
      <ReadOnlyField label="Code postal" value={legalIdentity.postalCode} />
      <ReadOnlyField label="Ville" value={legalIdentity.city} />
      <ReadOnlyField label="Pays" value={legalIdentity.country} />
      <ReadOnlyField label="Téléphone" value={legalIdentity.phone} />
      <ReadOnlyField label="Email général" value={legalIdentity.generalEmail} />
      <ReadOnlyField label="Site web" value={legalIdentity.website} />
    </dl>
  );
}

function ReadOnlyField({ label, value }: { label: string; value?: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="text-sm text-neutral-900">{value ?? "Non renseigné"}</dd>
    </div>
  );
}
