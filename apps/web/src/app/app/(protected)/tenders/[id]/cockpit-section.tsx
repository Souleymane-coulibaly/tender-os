import Link from "next/link";
import {
  COCKPIT_ALERT_LABELS,
  COCKPIT_MODULE_LABELS,
  COCKPIT_MODULE_ROUTES,
  COCKPIT_MODULE_STATUS_LABELS,
  COCKPIT_NEXT_ACTION_LABELS,
  COCKPIT_STEP_LABELS,
  cockpitAlertBadgeClass,
  cockpitModuleStatusBadgeClass,
  type TenderCockpit,
} from "../../../../../lib/cockpit-types";

/** Mission Sprint 8A.2 — Cockpit Bid Manager : vue d'ensemble backend-driven en tête de la fiche
 *  Tender (additive, ne remplace aucune section existante) — étape courante, statut par module,
 *  blocages/avertissements, prochaine action, avec des liens directs vers chaque sous-écran déjà
 *  existant. Tout le calcul vient de `GET /tenders/:id/cockpit` (`GetTenderCockpitUseCase`),
 *  jamais reconstruit ici. */
export function CockpitSection({ tenderId, cockpit }: { tenderId: string; cockpit: TenderCockpit }) {
  return (
    <section className="rounded border border-neutral-200 p-4" aria-labelledby="cockpit-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="cockpit-heading" className="text-sm font-semibold text-neutral-700">
            Cockpit
          </h2>
          <p className="text-sm text-neutral-900">{COCKPIT_STEP_LABELS[cockpit.currentStep] ?? cockpit.currentStep}</p>
        </div>
        <div className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white">
          Prochaine action : {COCKPIT_NEXT_ACTION_LABELS[cockpit.nextAction] ?? cockpit.nextAction}
        </div>
      </div>

      {cockpit.alerts.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {cockpit.alerts.map((alert, index) => (
            <li key={`${alert.code}-${index}`} role={alert.level === "BLOCKER" ? "alert" : undefined} className={`rounded border px-3 py-1.5 text-xs ${cockpitAlertBadgeClass(alert.level)}`}>
              {COCKPIT_ALERT_LABELS[alert.code] ?? alert.code}
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cockpit.modules.map((module) => {
          const route = COCKPIT_MODULE_ROUTES[module.key];
          const label = COCKPIT_MODULE_LABELS[module.key] ?? module.key;
          const content = (
            <div className="flex h-full flex-col gap-1 rounded border border-neutral-200 p-2.5 hover:border-neutral-400">
              <span className="text-xs font-medium text-neutral-700">{label}</span>
              <span className={`w-fit rounded px-1.5 py-0.5 text-[11px] font-medium ${cockpitModuleStatusBadgeClass(module.status)}`}>
                {COCKPIT_MODULE_STATUS_LABELS[module.status] ?? module.status}
                {module.total !== undefined ? ` (${module.count ?? 0}/${module.total})` : null}
              </span>
            </div>
          );
          return (
            <li key={module.key}>
              {route ? (
                <Link href={`/app/tenders/${tenderId}/${route}`} className="block h-full">
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
