import Link from "next/link";
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
 */
export function DashboardHeader({ firstName, subscription, actorRole }: { firstName: string; subscription: OrganizationSubscriptionDto | null; actorRole: string | undefined }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-tenderos-navy/10 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="font-tenderos-display text-2xl font-extrabold text-tenderos-navy">Bonjour {firstName} 👋</h1>
        <p className="mt-1 text-sm text-tenderos-slate">Voici ce qui nécessite votre attention aujourd&apos;hui.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          {/* Correctif audit Codex Checkpoint 25C (P1) — "Importer un DCE" pointe vers
              `/app/tenders/new` (aucune route d'import DCE indépendante n'existe, voir
              quick-actions-panel.tsx), donc gated par la MÊME permission que "Créer un dossier"
              (`TenderPermission.Create`, jamais `canManageWorkspace` qui inclut CONTRIBUTOR — une
              cible qui exige Create ne peut jamais être montrée à un rôle qui ne l'a pas). */}
          {canCreateTender(actorRole) ? (
            <Link href="/app/tenders/new" className="font-medium text-tenderos-blue hover:underline">
              Importer un DCE
            </Link>
          ) : null}
          {canUseMarketWatch(actorRole) ? (
            <Link href="/app/market-watch" className="font-medium text-tenderos-blue hover:underline">
              Explorer les opportunités
            </Link>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-3">
        <PlanBadge subscription={subscription} />
        {canCreateTender(actorRole) ? (
          <Link href="/app/tenders/new" className="rounded-lg bg-tenderos-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-tenderos-navy/90">
            + Nouvel appel d&apos;offres
          </Link>
        ) : null}
      </div>
    </div>
  );
}
