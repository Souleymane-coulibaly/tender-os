import Link from "next/link";
import { UNLIMITED, formatQuotaLimit, formatStorageBytes, type OrganizationEntitlementsDto, type OrganizationSubscriptionDto, type OrganizationUsageDto } from "../../../lib/billing-types";

function UsageBar({ icon, label, value, max, valueLabel }: { icon: React.ReactNode; label: string; value: number; max: number | null; valueLabel: string }) {
  const percent = max !== null && max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm text-tenderos-navy">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-tenderos-light" aria-hidden="true">
            {icon}
          </span>
          {label}
        </span>
        <span className="text-xs font-medium text-tenderos-slate">{valueLabel}</span>
      </div>
      {max !== null ? (
        <span className="h-1.5 w-full overflow-hidden rounded-full bg-tenderos-light">
          <span className="block h-full rounded-full bg-tenderos-blue" style={{ width: `${percent}%` }} />
        </span>
      ) : null}
    </div>
  );
}

const FOLDER_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 2h6l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zM9 13h6M9 17h6" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CHAT_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const STORAGE_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 17.5A3.5 3.5 0 017.5 14H8a5 5 0 019.9-1H18a3 3 0 011 5.83" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const USERS_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M8 11a3 3 0 100-6 3 3 0 000 6zM17 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5M13 15c2.5 0 6 2 6 5" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * V2 Sprint 25 (Dashboard Premium) — mission §25.61/§25.62 "Mon utilisation". Restylage premium de
 * `BillingSummaryWidget` (retiré de cette page, jamais un second calcul de quota/usage — mêmes
 * données `entitlements`/`usage`/`aoCreditBalance`, Sprint 22).
 */
export function UsageWidget({
  subscription,
  entitlements,
  usage,
  aoCreditBalance,
}: {
  subscription: OrganizationSubscriptionDto | null;
  entitlements: OrganizationEntitlementsDto;
  usage: OrganizationUsageDto;
  aoCreditBalance: number;
}) {
  const quotas = entitlements.quotas;
  const isTrialing = subscription?.status === "TRIALING";

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-tenderos-navy/10 bg-white p-5 shadow-sm">
      <h2 className="font-tenderos-display text-base font-bold text-tenderos-navy">Mon utilisation</h2>

      <div className="flex flex-col gap-4">
        {/* Mission §25.62 — pendant le Trial, jamais "X / N disponibles" avec le plafond de report
            Starter en denominateur (le grant mensuel n'a pas encore démarré) : uniquement le solde
            réel du crédit d'essai. */}
        <UsageBar
          icon={FOLDER_ICON}
          label="Crédits AO"
          value={aoCreditBalance}
          max={isTrialing || !quotas || quotas.AO_ROLLOVER_CAP === UNLIMITED ? null : quotas.AO_ROLLOVER_CAP}
          valueLabel={isTrialing ? `${aoCreditBalance} crédit${aoCreditBalance === 1 ? "" : "s"} AO d'essai` : `${aoCreditBalance} / ${quotas ? formatQuotaLimit(quotas.AO_ROLLOVER_CAP) : "—"} disponibles`}
        />
        <UsageBar
          icon={CHAT_ICON}
          label="Chat IA"
          value={usage.chatMessagesToday}
          max={quotas && quotas.CHAT_AI_DAILY_MAX !== UNLIMITED ? quotas.CHAT_AI_DAILY_MAX : null}
          valueLabel={`${usage.chatMessagesToday} / ${quotas ? formatQuotaLimit(quotas.CHAT_AI_DAILY_MAX) : "—"} aujourd'hui`}
        />
        <UsageBar
          icon={STORAGE_ICON}
          label="Stockage"
          value={usage.storageBytesUsed / (1024 * 1024 * 1024)}
          max={quotas && quotas.STORAGE_GB_MAX !== UNLIMITED ? quotas.STORAGE_GB_MAX : null}
          valueLabel={`${formatStorageBytes(usage.storageBytesUsed)} / ${quotas && quotas.STORAGE_GB_MAX !== UNLIMITED ? `${quotas.STORAGE_GB_MAX} Go` : "Illimité*"}`}
        />
        <UsageBar
          icon={USERS_ICON}
          label="Utilisateurs"
          value={usage.activeUsers}
          max={quotas && quotas.USERS_MAX !== UNLIMITED ? quotas.USERS_MAX : null}
          valueLabel={`${usage.activeUsers} / ${quotas ? formatQuotaLimit(quotas.USERS_MAX) : "—"} utilisateurs`}
        />
      </div>

      <Link href="/app/subscription" className="text-sm font-medium text-tenderos-blue hover:underline">
        Voir tous les détails
      </Link>
    </section>
  );
}
