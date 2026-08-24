import Link from "next/link";
import { Card } from "../../../components/ui";
import type { DashboardMarketWatch } from "../../../lib/dashboard-types";

/**
 * V2 Sprint 25 (Dashboard Premium) — mission §25.63/§25.64 "Opportunités recommandées". Données
 * réelles issues du moteur de correspondance Market Watch (Sprint 17), jamais un score inventé.
 *
 * Checkpoint TENDEROS-2.1-P2.3-E5.1 (Design System V2) — enveloppe `&lt;Card&gt;` (doublon exact du
 * balisage local précédent).
 */
export function MarketWatchWidget({ marketWatch }: { marketWatch: DashboardMarketWatch }) {
  return (
    <Card
      title="Opportunités recommandées"
      actions={
        marketWatch.hasSavedSearches ? (
          <Link href="/app/market-watch" className="text-sm font-medium text-tenderos-blue hover:underline">
            Voir toutes
          </Link>
        ) : undefined
      }
    >
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
              {/* Checkpoint TENDEROS-2.1-P2.3-E10 (correctif) — la route `/app/market-watch/:savedSearchId/matches`
                  n'a jamais existé (seules `/app/market-watch?searchId=` et
                  `/app/market-watch/:externalTenderId` existent) : ce lien du widget Dashboard était
                  mort depuis sa création (Sprint 25). Corrigé vers la fiche du marché lui-même — le
                  CTA le plus précis pour une recommandation individuelle (mission §33). */}
              <Link
                href={`/app/market-watch/${opportunity.externalTenderId}`}
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
    </Card>
  );
}
