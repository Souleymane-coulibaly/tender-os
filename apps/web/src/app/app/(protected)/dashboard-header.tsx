import Link from "next/link";
import { Button, PageHeader } from "../../../components/ui";
import { PLAN_TIER_LABELS, daysRemainingInTrial, type OrganizationSubscriptionDto } from "../../../lib/billing-types";
import { canCreateTender } from "./dashboard-permissions";
import { canUseMarketWatch } from "../../../lib/market-watch-types";

function PlanBadge({ subscription }: { subscription: OrganizationSubscriptionDto | null }) {
  if (!subscription) {
    return <Link href="/app/subscription" className="rounded-full border border-tenderos-navy/15 px-3 py-1.5 text-xs font-semibold text-tenderos-navy">Choisir une offre</Link>;
  }

  if (subscription.status === "TRIALING" && subscription.trialEndsAt) {
    const days = daysRemainingInTrial(subscription.trialEndsAt);
    return (
      <Link href="/app/subscription" className="flex flex-col rounded-lg bg-tenderos-gold/15 px-3 py-1.5 leading-tight">
        <span className="text-xs font-bold text-tenderos-navy">Essai {PLAN_TIER_LABELS[subscription.planTier]}</span>
        <span className="text-[11px] text-tenderos-navy/70">
          {days} jour{days === 1 ? "" : "s"} restant{days === 1 ? "" : "s"}
        </span>
      </Link>
    );
  }

  return (
    <Link href="/app/subscription" className="rounded-full bg-tenderos-light px-3 py-1.5 text-xs font-semibold text-tenderos-navy">
      {PLAN_TIER_LABELS[subscription.planTier]}
    </Link>
  );
}

/**
 * V2 Sprint 25 (Dashboard Premium) — mission §25.55/§25.56. Notifications/profil/déconnexion
 * restent dans le chrome partagé (`(protected)/layout.tsx`, hors périmètre — mission "ne pas
 * refondre arbitrairement toutes les pages", cette barre est partagée par TOUTE la surface `/app`,
 * pas seulement le Dashboard). Cette en-tête ajoute uniquement ce qui est propre à cette page :
 * salutation, statut plan/Trial, et les CTA d'activation.
 *
 * Checkpoint TENDEROS-2.1-P2.3-E5.1 (Design System V2) — migré vers `&lt;PageHeader&gt;`, dont le
 * propre commentaire documente qu'il a été "généralisé depuis DashboardHeader" (Sprint 25F) : le
 * balisage `rounded-2xl border border-tenderos-navy/10 bg-white p-5 shadow-sm sm:flex-row...` était
 * DÉJÀ un doublon exact, jamais convergé jusqu'ici. `status` accueille `PlanBadge` (même position
 * visuelle qu'avant), `actions` le CTA primaire ; les deux liens secondaires ("Importer un DCE"/
 * "Explorer les opportunités") n'ont pas de slot dédié dans `PageHeader` — composés dans
 * `description` (accepte un `ReactNode`, pas seulement une chaîne) pour préserver leur position
 * exacte sous le titre, sans élargir l'API du composant partagé pour un seul appelant.
 */
export function DashboardHeader({ firstName, subscription, actorRole }: { firstName: string; subscription: OrganizationSubscriptionDto | null; actorRole: string | undefined }) {
  const showImportDce = canCreateTender(actorRole);
  const showMarketWatch = canUseMarketWatch(actorRole);

  return (
    <PageHeader
      title={`Bonjour ${firstName} 👋`}
      status={<PlanBadge subscription={subscription} />}
      description={
        <>
          <span>Voici ce qui nécessite votre attention aujourd&apos;hui.</span>
          {showImportDce || showMarketWatch ? (
            <span className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              {/* Correctif audit Codex Checkpoint 25C (P1) — "Importer un DCE" pointe vers
                  `/app/tenders/new` (aucune route d'import DCE indépendante n'existe, voir
                  quick-actions-panel.tsx), donc gated par la MÊME permission que "Créer un
                  dossier" (`TenderPermission.Create`, jamais `canManageWorkspace` qui inclut
                  CONTRIBUTOR — une cible qui exige Create ne peut jamais être montrée à un rôle
                  qui ne l'a pas). */}
              {showImportDce ? (
                <Link href="/app/tenders/new" className="font-medium text-tenderos-blue hover:underline">
                  Importer un DCE
                </Link>
              ) : null}
              {showMarketWatch ? (
                <Link href="/app/market-watch" className="font-medium text-tenderos-blue hover:underline">
                  Explorer les opportunités
                </Link>
              ) : null}
            </span>
          ) : null}
        </>
      }
      actions={showImportDce ? <Button href="/app/tenders/new" variant="primary" size="lg">+ Nouvel appel d&apos;offres</Button> : undefined}
    />
  );
}
