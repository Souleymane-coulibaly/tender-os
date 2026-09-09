import Link from "next/link";

/**
 * Checkpoint TENDEROS-2.1-CCV2-I.1 — frontière sémantique ClientAccount (CRM) / CandidateCompany
 * (entité juridique qui candidate).
 *
 * Ces rubriques restent LISIBLES : les données historiques d'un client ne sont ni supprimées ni
 * déplacées. Ce qui disparaît, c'est la possibilité d'en créer de NOUVELLES ici — l'API les refuse
 * désormais (`CLIENT_BIDDER_WRITE_RETIRED`). Laisser les formulaires en place proposerait une
 * action vouée à échouer, ce qui est pire que de ne pas la proposer.
 */
export function RetiredBidderNotice({ domainLabel, isEmpty = false }: { domainLabel: string; isEmpty?: boolean }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-medium text-amber-900">
        {isEmpty ? "Rubrique transférée à l'entreprise candidate" : "Rubrique historique — lecture seule"}
      </p>
      <p className="mt-1 text-sm text-amber-800">
        {domainLabel} relève désormais de l&apos;entreprise candidate, l&apos;entité juridique qui répond à vos appels
        d&apos;offres.{" "}
        {isEmpty
          ? "Aucune donnée historique ne subsiste ici : celles de ce client ont acquis leur propriétaire définitif et se consultent désormais sur la fiche "
          : "Les données ci-dessous restent consultables ; leur gestion se fait sur la fiche "}
        <Link href="/app/candidate-companies" className="font-medium underline hover:text-amber-950">
          Entreprise candidate
        </Link>
        .
      </p>
    </div>
  );
}
