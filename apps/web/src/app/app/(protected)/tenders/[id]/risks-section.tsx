"use client";

import { useActionState, useState } from "react";
import { Badge, type BadgeTone } from "../../../../../components/ui/badge";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import { Input } from "../../../../../components/ui/input";
import { Select } from "../../../../../components/ui/select";
import { changeRiskStatusAction, createRiskAction, type FormActionState } from "../../../actions";
import {
  RISK_SEVERITY_LABELS,
  RISK_STATUS_LABELS,
  type Risk,
  type RiskSeverity,
  type RiskStatus,
} from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};
const SEVERITIES: RiskSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES: RiskStatus[] = ["OPEN", "MITIGATED", "RESOLVED", "ACCEPTED"];

/**
 * Design System — remplace l'ancien `severityBadgeClass()` local (voir `alerts-section.tsx` pour la
 * justification). `HIGH` etait la seule nuance sans jeton semantique equivalent : `orange-100/800`
 * rejoint `warning`, deja porte par `MEDIUM`. La distinction reste lisible par le LIBELLE, qui est
 * obligatoire dans `Badge` — jamais par la couleur seule.
 */
const SEVERITY_TONE: Record<RiskSeverity, BadgeTone> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "warning",
  LOW: "neutral",
};

function RiskRow({ tenderId, risk }: { tenderId: string; risk: Risk }) {
  const [status, setStatus] = useState(risk.status);
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);

  return (
    <li className="flex items-center justify-between gap-3 border-b border-tenderos-navy/10 py-2 text-sm">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge tone={SEVERITY_TONE[risk.severity]}>{RISK_SEVERITY_LABELS[risk.severity]}</Badge>
        <span className="font-medium text-tenderos-navy">{risk.title}</span>
        {error ? (
          <p role="alert" className="text-xs text-danger-fg">
            {error}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 basis-40">
        <Select
          value={status}
          disabled={isPending}
          aria-label={`Statut du risque ${risk.title}`}
          onChange={async (event) => {
            const nextStatus = event.target.value as RiskStatus;
            setIsPending(true);
            setStatus(nextStatus);
            const result = await changeRiskStatusAction(tenderId, risk.id, nextStatus);
            setIsPending(false);
            setError(result.error);
          }}
        >
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {RISK_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>
    </li>
  );
}

export function RisksSection({ tenderId, risks }: { tenderId: string; risks: Risk[] }) {
  const boundAction = createRiskAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <Card title="Risques">
      <div className="flex flex-col gap-2">
        {risks.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucun risque identifie.</p>
        ) : (
          <ul>
            {risks.map((risk) => (
              <RiskRow key={risk.id} tenderId={tenderId} risk={risk} />
            ))}
          </ul>
        )}
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <Input
            name="title"
            type="text"
            required
            placeholder="Nouveau risque..."
            className="min-w-[10rem] flex-1"
          />
          {/* Largeur portee par un conteneur : `Select` sans `label` ignore `wrapperClassName`. */}
          <div className="shrink-0 grow-0 basis-36">
            <Select name="severity" defaultValue="MEDIUM" aria-label="Gravité du risque">
              {SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {RISK_SEVERITY_LABELS[value]}
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
