"use client";

import { useActionState, useState } from "react";
import { changeRiskStatusAction, createRiskAction, type FormActionState } from "../../../actions";
import type { Risk, RiskSeverity, RiskStatus } from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};
const SEVERITIES: RiskSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES: RiskStatus[] = ["OPEN", "MITIGATED", "RESOLVED", "ACCEPTED"];

function severityBadgeClass(severity: RiskSeverity): string {
  switch (severity) {
    case "CRITICAL":
      return "bg-red-100 text-red-800";
    case "HIGH":
      return "bg-orange-100 text-orange-800";
    case "MEDIUM":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
}

function RiskRow({ tenderId, risk }: { tenderId: string; risk: Risk }) {
  const [status, setStatus] = useState(risk.status);
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);

  return (
    <li className="flex items-center justify-between gap-3 border-b border-neutral-100 py-2 text-sm">
      <div>
        <span className={`mr-2 rounded px-2 py-0.5 text-xs font-medium ${severityBadgeClass(risk.severity)}`}>
          {risk.severity}
        </span>
        <span className="font-medium text-neutral-900">{risk.title}</span>
        {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
      </div>
      <select
        value={status}
        disabled={isPending}
        onChange={async (event) => {
          const nextStatus = event.target.value as RiskStatus;
          setIsPending(true);
          setStatus(nextStatus);
          const result = await changeRiskStatusAction(tenderId, risk.id, nextStatus);
          setIsPending(false);
          setError(result.error);
        }}
        className="rounded border border-neutral-300 px-2 py-1 text-xs"
      >
        {STATUSES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </li>
  );
}

export function RisksSection({ tenderId, risks }: { tenderId: string; risks: Risk[] }) {
  const boundAction = createRiskAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-700">Risques</h2>
      {risks.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucun risque identifie.</p>
      ) : (
        <ul>
          {risks.map((risk) => (
            <RiskRow key={risk.id} tenderId={tenderId} risk={risk} />
          ))}
        </ul>
      )}
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input
          name="title"
          type="text"
          required
          placeholder="Nouveau risque..."
          className="min-w-[10rem] flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <select name="severity" defaultValue="MEDIUM" className="rounded border border-neutral-300 px-2 py-1 text-sm">
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
