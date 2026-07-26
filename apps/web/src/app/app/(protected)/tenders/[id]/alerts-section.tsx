"use client";

import { useActionState, useState } from "react";
import { createAlertAction, resolveAlertAction, type FormActionState } from "../../../actions";
import type { Alert, AlertSeverity } from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};
const SEVERITIES: AlertSeverity[] = ["INFO", "WARNING", "CRITICAL"];

function severityBadgeClass(severity: AlertSeverity): string {
  switch (severity) {
    case "CRITICAL":
      return "bg-red-100 text-red-800";
    case "WARNING":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
}

function AlertRow({ tenderId, alert }: { tenderId: string; alert: Alert }) {
  const [resolved, setResolved] = useState(alert.resolved);
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);

  return (
    <li className="flex items-center justify-between gap-3 border-b border-neutral-100 py-2 text-sm">
      <div>
        <span className={`mr-2 rounded px-2 py-0.5 text-xs font-medium ${severityBadgeClass(alert.severity)}`}>
          {alert.severity}
        </span>
        <span className="text-neutral-900">{alert.message}</span>
        {resolved ? <span className="ml-2 text-xs text-green-700">resolue</span> : null}
        {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
      </div>
      {!resolved ? (
        <button
          type="button"
          disabled={isPending}
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
          className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50"
        >
          {isPending ? "..." : "Resoudre"}
        </button>
      ) : null}
    </li>
  );
}

export function AlertsSection({ tenderId, alerts }: { tenderId: string; alerts: Alert[] }) {
  const boundAction = createAlertAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-700">Alertes</h2>
      {alerts.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucune alerte.</p>
      ) : (
        <ul>
          {alerts.map((alert) => (
            <AlertRow key={alert.id} tenderId={tenderId} alert={alert} />
          ))}
        </ul>
      )}
      <form action={formAction} className="flex items-end gap-2">
        <input
          name="message"
          type="text"
          required
          placeholder="Nouvelle alerte..."
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <select name="severity" defaultValue="WARNING" className="rounded border border-neutral-300 px-2 py-1 text-sm">
          {SEVERITIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
        >
          Ajouter
        </button>
        {state.error ? (
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
