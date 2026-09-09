import Link from "next/link";
import { Alert } from "../../../../../components/ui/alert";
import { Badge } from "../../../../../components/ui/badge";
import { Card } from "../../../../../components/ui/card";
import {
  COCKPIT_ALERT_LABELS,
  COCKPIT_MODULE_LABELS,
  COCKPIT_MODULE_ROUTES,
  COCKPIT_MODULE_STATUS_LABELS,
  COCKPIT_NEXT_ACTION_LABELS,
  COCKPIT_STEP_LABELS,
  cockpitAlertTone,
  cockpitModuleStatusTone,
  type TenderCockpit,
} from "../../../../../lib/cockpit-types";

/** Mission Sprint 8A.2 — Cockpit Bid Manager : vue d'ensemble backend-driven en tête de la fiche
 *  Tender (additive, ne remplace aucune section existante) — étape courante, statut par module,
 *  blocages/avertissements, prochaine action, avec des liens directs vers chaque sous-écran déjà
 *  existant. Tout le calcul vient de `GET /tenders/:id/cockpit` (`GetTenderCockpitUseCase`),
 *  jamais reconstruit ici. */
export function CockpitSection({
  tenderId,
  cockpit,
}: {
  tenderId: string;
  cockpit: TenderCockpit;
}) {
  return (
    <Card
      title="Cockpit"
      description={COCKPIT_STEP_LABELS[cockpit.currentStep] ?? cockpit.currentStep}
      actions={
        <Badge tone="gold">
          Prochaine action : {COCKPIT_NEXT_ACTION_LABELS[cockpit.nextAction] ?? cockpit.nextAction}
        </Badge>
      }
    >
      {cockpit.alerts.length > 0 ? (
        <ul className="mb-4 flex flex-col gap-1.5">
          {cockpit.alerts.map((alert, index) => (
            <li key={`${alert.code}-${index}`}>
              <Alert tone={cockpitAlertTone(alert.level)}>
                {COCKPIT_ALERT_LABELS[alert.code] ?? alert.code}
              </Alert>
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cockpit.modules.map((module) => {
          const route = COCKPIT_MODULE_ROUTES[module.key];
          const label = COCKPIT_MODULE_LABELS[module.key] ?? module.key;
          const content = (
            <div className="flex h-full flex-col items-start gap-1.5 rounded-lg border border-tenderos-navy/10 p-2.5 transition hover:border-tenderos-blue/40">
              <span className="text-xs font-medium text-tenderos-navy">{label}</span>
              <Badge tone={cockpitModuleStatusTone(module.status)}>
                {COCKPIT_MODULE_STATUS_LABELS[module.status] ?? module.status}
                {module.total !== undefined ? ` (${module.count ?? 0}/${module.total})` : null}
              </Badge>
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
    </Card>
  );
}
