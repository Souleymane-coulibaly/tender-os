import Link from "next/link";
import { Card } from "../card";

export type BarDistributionItem = {
  key: string;
  label: string;
  count: number;
  colorClass: string;
  href?: string;
};

/**
 * Checkpoint TENDEROS-2.1-P2.3-E5 (Dashboard V2, Premium Analytics addendum §6/§7/§8) —
 * visualisation horizontale réutilisable pour toute distribution d'un petit ensemble d'états
 * (Pipeline, GO/NO-GO, Readiness) : UNE seule implémentation, jamais un composant par graphique
 * (mission §24 "ne pas importer une énorme dépendance pour 3 graphiques simples" — ici, ne pas
 * dupliquer 3 composants presque identiques). Rendu 100% SVG/CSS, aucune dépendance externe.
 *
 * Accessibilité (mission §30 addendum E5) — chaque segment porte son compte et son pourcentage en
 * texte réel à côté de la barre (jamais une donnée accessible uniquement par la longueur du
 * trait) : contrairement à `TrendAreaChart` (où le SVG est la SEULE représentation des points),
 * ce texte visible EST déjà l'alternative accessible, jamais besoin d'un second tableau `sr-only`
 * caché — correctif audit E5 (un premier essai avec `aria-hidden` sur tout le bloc + tableau caché
 * rendait les liens de segment inatteignables au clavier/lecteur d'écran, une vraie régression
 * d'accessibilité que ce composant existe justement pour éviter).
 *
 * Checkpoint TENDEROS-2.1-P2.3-E5.1 (Design System V2) — enveloppe désormais `&lt;Card&gt;` plutôt
 * qu'une `&lt;section&gt;` locale : le balisage (`rounded-2xl border border-tenderos-navy/10 bg-white
 * p-5 shadow-sm`, titre `&lt;h2&gt;` identique) était un doublon EXACT du composant partagé, jamais
 * convergé lors de sa création en E5 (le Design System B n'existait pas encore dans ce fichier).
 */
export function BarDistribution({
  title,
  subtitle,
  items,
  total,
  emptyLabel,
  headerExtra,
}: {
  title: string;
  subtitle?: string;
  items: BarDistributionItem[];
  total: number;
  emptyLabel: string;
  /** Slot optionnel pour un indicateur numérique complémentaire (ex. "Taux de GO") affiché à droite
   *  de l'en-tête — évite un positionnement absolu fragile pour ce cas d'usage récurrent. */
  headerExtra?: React.ReactNode;
}) {
  return (
    <Card title={title} description={subtitle} actions={headerExtra}>
      {total === 0 ? (
        <p className="py-6 text-center text-sm text-tenderos-slate">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => {
            const percent = total > 0 ? Math.round((item.count / total) * 100) : 0;
            const row = (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-tenderos-navy">{item.label}</span>
                  <span className="tabular-nums text-tenderos-slate">
                    {item.count} <span className="text-xs">({percent}%)</span>
                  </span>
                </div>
                <span className="block h-2 w-full overflow-hidden rounded-full bg-tenderos-light" aria-hidden="true">
                  <span className={`block h-full rounded-full ${item.colorClass}`} style={{ width: `${Math.max(percent, item.count > 0 ? 3 : 0)}%` }} />
                </span>
              </div>
            );
            return item.href ? (
              <Link key={item.key} href={item.href} className="rounded-lg transition hover:bg-tenderos-light/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tenderos-blue">
                {row}
              </Link>
            ) : (
              <div key={item.key}>{row}</div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
