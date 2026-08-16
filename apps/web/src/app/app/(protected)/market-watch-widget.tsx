import Link from "next/link";
import type { DashboardMarketWatch } from "../../../lib/dashboard-types";

/**
 * V2 Sprint 25 (Dashboard Premium) — mission §25.63/§25.64 "Opportunités recommandées". Données
 * réelles issues du moteur de correspondance Market Watch (Sprint 17), jamais un score inventé.
 */
export function MarketWatchWidget({ marketWatch }: { marketWatch: DashboardMarketWatch }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-tenderos-navy/10 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-tenderos-display text-base font-bold text-tenderos-navy">Opportunités recommandées</h2>
        {marketWatch.hasSavedSearches ? (
          <Link href="/app/market-watch" className="text-sm font-medium text-tenderos-blue hover:underline">
            Voir toutes
          </Link>
        ) : null}
      </div>

      {!marketWatch.hasSavedSearches ? (
        <div className="flex flex-col items-start gap-2 py-2">
          <p className="text-sm text-tenderos-slate">Configurer votre veille pour recevoir des opportunités adaptées.</p>
          <Link href="/app/market-watch" className="rounded-lg bg-tenderos-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-tenderos-navy/90">
            Configurer ma veille
          </Link>
        </div>
      ) : marketWatch.recommended.length === 0 ? (
        <p className="py-2 text-sm text-tenderos-slate">Aucune opportunité pertinente pour le moment — nous continuons de surveiller vos critères.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {marketWatch.recommended.map((opportunity) => (
            <li key={opportunity.externalTenderId}>
              <Link
                href={`/app/market-watch/${opportunity.savedSearchId}/matches`}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition hover:bg-tenderos-light/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-tenderos-navy">{opportunity.title}</p>
                  <p className="truncate text-xs text-tenderos-slate">{opportunity.buyerName ?? "Acheteur non renseigné"}</p>
                  {opportunity.matchedLabels.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {opportunity.matchedLabels.map((label) => (
                        <span key={label} className="rounded-full bg-tenderos-light px-2 py-0.5 text-[11px] font-medium text-tenderos-navy/70">
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <span className="shrink-0 rounded-full bg-tenderos-gold/15 px-2.5 py-1 text-xs font-bold text-tenderos-navy">{Math.round(opportunity.score)}% match</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
