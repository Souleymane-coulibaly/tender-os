import Link from "next/link";
import { Card } from "../../../components/ui";

const FOLDER_ICON = <path d="M9 2h6l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zM9 13h6M9 17h6" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;
const CALENDAR_ICON = <path d="M8 2v4M16 2v4M3 9h18M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" stroke="#7C4DFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;
const CHECK_CIRCLE_ICON = (
  <>
    <circle cx="12" cy="12" r="9" stroke="#1A9E5C" strokeWidth="1.8" />
    <path d="M8 12.3L10.6 15L16 9" stroke="#1A9E5C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </>
);
const STAR_ICON = <path d="M12 2l2.5 5 5.5.8-4 3.9.9 5.5L12 14.7 7.1 17.2l.9-5.5-4-3.9 5.5-.8z" stroke="#D4AF37" strokeWidth="1.8" strokeLinejoin="round" />;
const TARGET_ICON = (
  <>
    <circle cx="12" cy="12" r="9" stroke="#1A9E5C" strokeWidth="1.8" />
    <circle cx="12" cy="12" r="4.5" stroke="#1A9E5C" strokeWidth="1.8" />
    <circle cx="12" cy="12" r="1" fill="#1A9E5C" />
  </>
);

function KpiCard({ label, value, subtitle, icon, iconBg, href }: { label: string; value: string | number; subtitle: string; icon: React.ReactNode; iconBg: string; href?: string }) {
  const content = (
    <Card interactive={!!href} className="h-full">
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`} aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              {icon}
            </svg>
          </span>
          <span className="text-sm font-medium text-tenderos-slate">{label}</span>
        </div>
        <div>
          <span className="text-3xl font-extrabold tabular-nums text-tenderos-navy">{value}</span>
        </div>
        <p className="text-xs text-tenderos-slate">{subtitle}</p>
      </div>
    </Card>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}

/**
 * V2 Sprint 25 (Dashboard Premium) — mission §25.57 "4-5 indicateurs utiles". "Dossiers à valider"
 * utilise `pendingApprovals` (demandes de validation où L'UTILISATEUR COURANT est l'approbateur,
 * Sprint 18) — cohérent avec l'en-tête "ce qui nécessite VOTRE attention aujourd'hui", jamais un
 * compte org-wide de tous les dossiers de réponse en révision. Mission §25.97 "Real Data Only" — pas
 * de sparkline : aucune série temporelle réelle n'existe pour ces compteurs, en inventer une
 * violerait "aucune fake activity".
 *
 * Checkpoint TENDEROS-2.1-P2.3-E5 (Premium Analytics addendum §3) — 5ᵉ KPI "Taux de GO", déjà
 * calculé côté backend (`analytics.goRate`, jamais recalculé ici). `null` (aucune décision sur la
 * période) affiche "—", jamais un 0% trompeur.
 *
 * Checkpoint TENDEROS-2.1-P2.3-E5.1 (Design System V2) — `KpiCard` enveloppe `Card` (`interactive`
 * reproduit exactement l'ancien `transition hover:shadow-md` local, doublon exact sinon).
 */
export function DashboardKpiRow({
  activeTenders,
  deadlinesNext7Days,
  pendingApprovals,
  relevantOpportunitiesCount,
  goRate,
}: {
  activeTenders: number;
  deadlinesNext7Days: number;
  pendingApprovals: number;
  relevantOpportunitiesCount: number;
  goRate: number | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <KpiCard label="Appels d'offres en cours" value={activeTenders} subtitle="Dossiers actifs" icon={FOLDER_ICON} iconBg="bg-tenderos-blue/10" href="/app/tenders" />
      <KpiCard label="Échéances à venir" value={deadlinesNext7Days} subtitle="Dans les 7 prochains jours" icon={CALENDAR_ICON} iconBg="bg-purple-100" href="/app/tenders?overdue=false" />
      <KpiCard label="Dossiers à valider" value={pendingApprovals} subtitle="En attente de votre validation" icon={CHECK_CIRCLE_ICON} iconBg="bg-green-100" href="/app/validations" />
      <KpiCard label="Opportunités pertinentes" value={relevantOpportunitiesCount} subtitle="Détectées par votre veille" icon={STAR_ICON} iconBg="bg-tenderos-gold/15" href="/app/market-watch" />
      <KpiCard label="Taux de GO" value={goRate !== null ? `${goRate}%` : "—"} subtitle="Décisions de la période" icon={TARGET_ICON} iconBg="bg-green-100" />
    </div>
  );
}
