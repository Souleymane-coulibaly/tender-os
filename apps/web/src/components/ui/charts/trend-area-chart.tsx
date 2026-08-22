export type TrendPoint = { date: string; count: number };

const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 160;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 8;

function formatShortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" });
}

/**
 * Checkpoint TENDEROS-2.1-P2.3-E5 (Dashboard V2, Premium Analytics addendum §4) — graphique
 * principal "Activité des appels d'offres". SVG pur, zéro dépendance externe (mission §24 "ne pas
 * importer une énorme dépendance pour 3 graphiques simples") — server component, aucun JS client :
 * les tooltips utilisent `<title>` natif (survol souris ET lecteur d'écran, mission §17/§30
 * addendum), jamais un widget JS.
 *
 * `points` doit toujours couvrir la période complète, un point par jour (voir
 * `GetTenderActivityTrendUseCase`) — jamais un jour silencieusement omis.
 */
export function TrendAreaChart({ points, seriesLabel }: { points: readonly TrendPoint[]; seriesLabel: string }) {
  const maxCount = Math.max(1, ...points.map((p) => p.count));
  const usableHeight = VIEW_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const stepX = points.length > 1 ? VIEW_WIDTH / (points.length - 1) : 0;

  const coords = points.map((point, index) => {
    const x = points.length > 1 ? index * stepX : VIEW_WIDTH / 2;
    const y = PADDING_TOP + usableHeight - (point.count / maxCount) * usableHeight;
    return { ...point, x, y };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const areaPath = coords.length > 0 ? `${linePath} L ${coords[coords.length - 1]!.x.toFixed(1)} ${VIEW_HEIGHT - PADDING_BOTTOM} L ${coords[0]!.x.toFixed(1)} ${VIEW_HEIGHT - PADDING_BOTTOM} Z` : "";

  const total = points.reduce((sum, p) => sum + p.count, 0);
  const first = points[0];
  const mid = points[Math.floor(points.length / 2)];
  const last = points[points.length - 1];

  return (
    <div className="flex flex-col gap-2">
      {total === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-xl bg-tenderos-light/40 text-center">
          <p className="text-sm font-medium text-tenderos-navy">Aucune activité sur cette période</p>
          <p className="text-xs text-tenderos-slate">Les appels d&apos;offres créés apparaîtront ici.</p>
        </div>
      ) : (
        <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} preserveAspectRatio="none" className="h-40 w-full" role="img" aria-labelledby="trend-chart-title">
          <title id="trend-chart-title">
            {seriesLabel} : {total} sur la période, de {formatShortDate(points[0]?.date ?? "")} à {formatShortDate(points[points.length - 1]?.date ?? "")}
          </title>
          {/* Grille horizontale discrète — repère visuel uniquement, jamais porteuse d'information seule. */}
          {[0.25, 0.5, 0.75].map((fraction) => (
            <line key={fraction} x1={0} x2={VIEW_WIDTH} y1={PADDING_TOP + usableHeight * fraction} y2={PADDING_TOP + usableHeight * fraction} stroke="#0A2540" strokeOpacity={0.06} strokeWidth={1} />
          ))}
          <path d={areaPath} fill="#1472FF" fillOpacity={0.12} />
          <path d={linePath} fill="none" stroke="#1472FF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {coords.map((c) => (
            <circle key={c.date} cx={c.x} cy={c.y} r={c.count > 0 ? 3 : 2} fill={c.count > 0 ? "#1472FF" : "#C9D3E0"} stroke="#FFFFFF" strokeWidth={1}>
              <title>
                {formatShortDate(c.date)} : {c.count} appel{c.count === 1 ? "" : "s"} d&apos;offres créé{c.count === 1 ? "" : "s"}
              </title>
            </circle>
          ))}
        </svg>
      )}

      {total > 0 && first && last ? (
        <div className="flex items-center justify-between text-xs text-tenderos-slate">
          <span>{formatShortDate(first.date)}</span>
          {mid && mid.date !== first.date && mid.date !== last.date ? <span>{formatShortDate(mid.date)}</span> : null}
          <span>{formatShortDate(last.date)}</span>
        </div>
      ) : null}

      {/* Alternative accessible complète (mission §30 addendum) — jamais l'information disponible
          uniquement dans le graphique. */}
      <table className="sr-only">
        <caption>{seriesLabel}, par jour</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Nombre</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <td>{point.date}</td>
              <td>{point.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
