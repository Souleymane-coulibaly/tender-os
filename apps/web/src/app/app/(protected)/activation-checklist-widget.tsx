import Link from "next/link";
import type { ActivationChecklistItemId, DashboardActivationChecklist } from "../../../lib/dashboard-types";

// V2 Sprint 25 (Guide interactif) — mission §25.69 "checklist dynamique". Chaque lien mène à la
// route réelle qui permet de compléter l'étape — jamais un simple libellé sans action.
const ITEM_LINKS: Partial<Record<ActivationChecklistItemId, string>> = {
  CANDIDATE_COMPANY_COMPLETE: "/app/clients",
  ADMINISTRATIVE_DOCUMENTS_ADDED: "/app/tenders",
  MARKET_WATCH_CONFIGURED: "/app/market-watch",
  FIRST_DCE_IMPORTED: "/app/tenders/new",
};

const CHECK_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="7" fill="#1A9E5C" />
    <path d="M4.8 8.2L6.8 10.2L11.2 5.8" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const OPEN_ICON = <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="7" stroke="#C9CFDA" strokeWidth="1.6" /></svg>;

/**
 * V2 Sprint 25 (Checkpoint 25D, mission §25.69-§25.71) — checklist d'activation dynamique, chaque
 * `completed` est dérivé de l'état réel côté backend (`GetDashboardOverviewUseCase`), jamais un
 * second état manuel côté frontend. Progression sobre ("N / 7 étapes terminées" + barre), jamais
 * de badges/confettis/points (mission "pas de gamification excessive").
 */
export function ActivationChecklistWidget({ checklist }: { checklist: DashboardActivationChecklist }) {
  if (checklist.completedCount === checklist.totalCount) return null;

  const percent = checklist.totalCount > 0 ? Math.round((checklist.completedCount / checklist.totalCount) * 100) : 0;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-tenderos-navy/10 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-tenderos-display text-base font-bold text-tenderos-navy">Votre checklist d&apos;activation</h2>
        <span className="text-sm font-medium text-tenderos-slate">
          {checklist.completedCount} / {checklist.totalCount} étapes terminées
        </span>
      </div>

      <span className="h-1.5 w-full overflow-hidden rounded-full bg-tenderos-light" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <span className="block h-full rounded-full bg-tenderos-blue transition-all" style={{ width: `${percent}%` }} />
      </span>

      <ul className="flex flex-col gap-2.5">
        {checklist.items.map((item) => {
          const href = !item.completed ? ITEM_LINKS[item.id] : undefined;
          const row = (
            <span className={`flex items-center gap-2.5 text-sm ${item.completed ? "text-tenderos-slate line-through" : "text-tenderos-navy"}`}>
              {item.completed ? CHECK_ICON : OPEN_ICON}
              {item.label}
            </span>
          );
          return <li key={item.id}>{href ? <Link href={href} className="rounded-md transition hover:bg-tenderos-light/60">{row}</Link> : row}</li>;
        })}
      </ul>
    </section>
  );
}
