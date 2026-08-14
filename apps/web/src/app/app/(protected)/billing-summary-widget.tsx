import Link from "next/link";
import {
  PLAN_TIER_LABELS,
  formatQuotaLimit,
  formatStorageBytes,
  UNLIMITED,
  type OrganizationEntitlementsDto,
  type OrganizationSubscriptionDto,
  type OrganizationUsageDto,
  type PassPurchaseDto,
} from "../../../lib/billing-types";

/** Mission §52 "léger résumé compact... ne pas refaire le Dashboard" — mêmes primitives visuelles
 *  que `WidgetCard`/`dashboard-widgets.tsx` (répliquées ici, celle-ci n'est pas exportée), affiche
 *  exactement les champs de l'exemple mission : plan, crédits AO, utilisateurs, Chat IA, stockage,
 *  "Gérer mon abonnement →". Pour un Pass AO (pas d'abonnement) : dossier disponible/actif
 *  uniquement, jamais les quotas Starter qui ne s'appliquent pas de la même façon. */
export function BillingSummaryWidget({
  subscription,
  entitlements,
  usage,
  aoCreditBalance,
  passPurchases,
}: {
  subscription: OrganizationSubscriptionDto | null;
  entitlements: OrganizationEntitlementsDto;
  usage: OrganizationUsageDto;
  aoCreditBalance: number;
  passPurchases: readonly PassPurchaseDto[];
}) {
  const quotas = entitlements.quotas;

  if (subscription) {
    return (
      <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
        <h2 className="text-sm font-semibold text-neutral-900">{PLAN_TIER_LABELS[subscription.planTier]}</h2>
        <div className="flex flex-col gap-1 text-sm text-neutral-700">
          <p>
            {aoCreditBalance} crédit{aoCreditBalance === 1 ? "" : "s"} AO disponible{aoCreditBalance === 1 ? "" : "s"}
          </p>
          <p>
            {usage.activeUsers} / {quotas ? formatQuotaLimit(quotas.USERS_MAX) : "—"} utilisateurs
          </p>
          <p>
            {usage.chatMessagesToday} / {quotas ? formatQuotaLimit(quotas.CHAT_AI_DAILY_MAX) : "—"} Chat IA
          </p>
          <p>
            {formatStorageBytes(usage.storageBytesUsed)} / {quotas && quotas.STORAGE_GB_MAX !== UNLIMITED ? `${quotas.STORAGE_GB_MAX} Go` : "Illimité*"}
          </p>
        </div>
        <Link href="/app/subscription" className="text-sm font-medium text-neutral-900 hover:underline">
          Gérer mon abonnement →
        </Link>
      </section>
    );
  }

  const availableCount = passPurchases.filter((p) => p.status === "AVAILABLE").length;
  const consumedPasses = passPurchases.filter((p) => p.status === "CONSUMED");

  if (availableCount > 0 || consumedPasses.length > 0) {
    return (
      <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
        <h2 className="text-sm font-semibold text-neutral-900">Pass AO</h2>
        <div className="flex flex-col gap-1 text-sm text-neutral-700">
          {availableCount > 0 ? (
            <p>
              {availableCount} AO disponible{availableCount === 1 ? "" : "s"}
            </p>
          ) : null}
          {consumedPasses.map((pass) => (
            <p key={pass.id}>Dossier actif : {pass.consumedTenderId}</p>
          ))}
        </div>
        <Link href="/app/subscription" className="text-sm font-medium text-neutral-900 hover:underline">
          Gérer mon abonnement →
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Abonnement</h2>
      <p className="text-sm text-neutral-600">Aucune offre active.</p>
      <Link href="/app/subscription" className="text-sm font-medium text-neutral-900 hover:underline">
        Choisir une offre →
      </Link>
    </section>
  );
}
