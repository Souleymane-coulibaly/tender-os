"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const PERIODS = [7, 30, 90] as const;

/**
 * Checkpoint TENDEROS-2.1-P2.3-E5 (Dashboard V2, Premium Analytics addendum §5) — sélecteur de
 * période 7/30/90 jours, seules valeurs acceptées par le backend (`DashboardQuerySchema`, mission
 * "ne pas créer plusieurs définitions métier selon la période"). Retiré du Dashboard par le Sprint
 * 25 précédent faute de widget réel en dépendant — désormais réintroduit car `activityTrend` et
 * `goRate`/`goNoGo` en dépendent réellement.
 */
export function PeriodSelector({ current }: { current: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function selectPeriod(days: number): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set("periodDays", String(days));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div role="group" aria-label="Période d'analyse" className="inline-flex items-center gap-0.5 rounded-lg border border-tenderos-navy/10 bg-tenderos-light/50 p-0.5">
      {PERIODS.map((days) => {
        const isActive = days === current;
        return (
          <button
            key={days}
            type="button"
            onClick={() => selectPeriod(days)}
            aria-pressed={isActive}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
              isActive ? "bg-white text-tenderos-navy shadow-sm" : "text-tenderos-slate hover:text-tenderos-navy"
            }`}
          >
            {days}j
          </button>
        );
      })}
    </div>
  );
}
