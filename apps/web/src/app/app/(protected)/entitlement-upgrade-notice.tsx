import Link from "next/link";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1 (mission §13 problème D) — le backend gate déjà ces actions par
 * `EntitlementFeature` (`assertEntitlementFeature`, module `billing`) ; jusqu'ici le frontend ne
 * relisait jamais `fetchEntitlements()` sur ces pages, laissant un rôle autorisé (OWNER/ADMIN)
 * remplir un formulaire qui échouait seulement à la soumission (402/403). Composant partagé — jamais
 * une règle de plan recalculée ici, uniquement l'affichage d'un état déjà déterminé côté backend.
 */
export function EntitlementUpgradeNotice({ featureLabel }: { featureLabel: string }) {
  return (
    <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
      <p>
        <strong>{featureLabel}</strong> : fonctionnalité non incluse dans votre offre actuelle.
      </p>
      <p className="mt-1">
        <Link href="/app/subscription" className="font-medium underline hover:no-underline">
          Consultez votre abonnement pour passer à une offre supérieure
        </Link>
        .
      </p>
    </div>
  );
}
