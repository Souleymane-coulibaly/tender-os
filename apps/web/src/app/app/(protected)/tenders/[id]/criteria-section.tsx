"use client";

import { useActionState } from "react";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import { Input } from "../../../../../components/ui/input";
import { createAwardCriterionAction, type FormActionState } from "../../../actions";
import type { AwardCriterion } from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};

export function CriteriaSection({
  tenderId,
  criteria,
}: {
  tenderId: string;
  criteria: AwardCriterion[];
}) {
  const boundAction = createAwardCriterionAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);
  const totalWeight = criteria.reduce((sum, criterion) => sum + Number(criterion.weight), 0);

  return (
    <Card title={`Criteres d'attribution${criteria.length > 0 ? ` (total ${totalWeight}%)` : ""}`}>
      <div className="flex flex-col gap-2">
        {criteria.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucun critere renseigne.</p>
        ) : (
          <ul>
            {criteria.map((criterion) => (
              <li key={criterion.id} className="border-b border-tenderos-navy/10 py-2 text-sm">
                <span className="font-medium text-tenderos-navy">{criterion.name}</span>
                <span className="ml-2 text-tenderos-slate">{criterion.weight}%</span>
              </li>
            ))}
          </ul>
        )}
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <Input
            name="name"
            type="text"
            required
            placeholder="Nom du critere..."
            className="min-w-[10rem] flex-1"
          />
          {/* `fieldControlClasses` impose `w-full` a tous les controles. Tailwind emet `.w-full`
              APRES `.w-20`, donc une largeur fixe serait ecrasee ici. On borne par la BASE FLEX,
              qui prime sur `width` pour un element flex — jamais par un `!important`. */}
          <Input
            name="weight"
            type="text"
            required
            placeholder="Poids %"
            inputMode="decimal"
            className="shrink-0 grow-0 basis-24"
          />
          <Button type="submit" size="sm" disabled={isPending}>
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
