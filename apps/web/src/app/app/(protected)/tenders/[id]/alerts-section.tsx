"use client";

import { useActionState, useState } from "react";
import { Badge, type BadgeTone } from "../../../../../components/ui/badge";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import { Input } from "../../../../../components/ui/input";
import { Select } from "../../../../../components/ui/select";
import { createAlertAction, resolveAlertAction, type FormActionState } from "../../../actions";
import type { Alert, AlertSeverity } from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};
const SEVERITIES: AlertSeverity[] = ["INFO", "WARNING", "CRITICAL"];

/**
 * Design System — la table de correspondance remplace l'ancien `severityBadgeClass()` local, qui
 * reproduisait a la main les classes de `Badge`. La configuration Tailwind annonce explicitement
 * cette convergence : les 6+ helpers `*BadgeClass()` dupliques doivent rejoindre les jetons
 * semantiques plutot que devenir un enieme jeu de classes. Valeurs visuelles identiques.
 */
const SEVERITY_TONE: Record<AlertSeverity, BadgeTone> = {
  CRITICAL: "danger",
  WARNING: "warning",
  INFO: "neutral",
};

function AlertRow({ tenderId, alert }: { tenderId: string; alert: Alert }) {
  const [resolved, setResolved] = useState(alert.resolved);
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);

  return (
    <li className="flex items-center justify-between gap-3 border-b border-tenderos-navy/10 py-2 text-sm">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge tone={SEVERITY_TONE[alert.severity]}>{alert.severity}</Badge>
        <span className="text-tenderos-navy">{alert.message}</span>
        {resolved ? <span className="text-xs text-success-fg">resolue</span> : null}
        {error ? (
          <p role="alert" className="text-xs text-danger-fg">
            {error}
          </p>
        ) : null}
      </div>
      {!resolved ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          loading={isPending}
          className="shrink-0"
          onClick={async () => {
            setIsPending(true);
            const result = await resolveAlertAction(tenderId, alert.id);
            setIsPending(false);
            if (result.error) {
              setError(result.error);
            } else {
              setResolved(true);
            }
          }}
        >
          Resoudre
        </Button>
      ) : null}
    </li>
  );
}

export function AlertsSection({ tenderId, alerts }: { tenderId: string; alerts: Alert[] }) {
  const boundAction = createAlertAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <Card title="Alertes">
      <div className="flex flex-col gap-2">
        {alerts.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucune alerte.</p>
        ) : (
          <ul>
            {alerts.map((alert) => (
              <AlertRow key={alert.id} tenderId={tenderId} alert={alert} />
            ))}
          </ul>
        )}
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <Input
            name="message"
            type="text"
            required
            placeholder="Nouvelle alerte..."
            className="min-w-[10rem] flex-1"
          />
          {/* `Select` sans `label` rend le controle nu et n'applique PAS `wrapperClassName` — la
              largeur doit donc etre portee par un conteneur explicite, jamais par cette prop. */}
          <div className="shrink-0 grow-0 basis-36">
            <Select name="severity" defaultValue="WARNING" aria-label="Gravite de l'alerte">
              {SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" size="sm" loading={isPending}>
            Ajouter
          </Button>
          {state.error ? (
            <p role="alert" className="text-xs text-danger-fg">
              {state.error}
            </p>
          ) : null}
        </form>
      </div>
    </Card>
  );
}
