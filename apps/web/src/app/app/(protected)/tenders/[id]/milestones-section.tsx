"use client";

import { useActionState, useState } from "react";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import { Input } from "../../../../../components/ui/input";
import { Select } from "../../../../../components/ui/select";
import {
  createMilestoneAction,
  markMilestoneDoneAction,
  type FormActionState,
} from "../../../actions";
import {
  MILESTONE_TYPE_LABELS,
  type Milestone,
  type MilestoneType,
} from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};
const TYPES: MilestoneType[] = [
  "SUBMISSION_DEADLINE",
  "QUESTION_DEADLINE",
  "MANDATORY_VISIT",
  "INTERNAL_VALIDATION",
  "CUSTOM",
];

function MilestoneRow({ tenderId, milestone }: { tenderId: string; milestone: Milestone }) {
  const [done, setDone] = useState(milestone.status === "DONE");
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);

  return (
    <li className="flex items-center justify-between gap-3 border-b border-tenderos-navy/10 py-2 text-sm">
      <div className="min-w-0">
        <span className="font-medium text-tenderos-navy">{milestone.title}</span>
        <span className="ml-2 text-tenderos-slate">
          {new Date(milestone.date).toLocaleDateString("fr-FR")}
        </span>
        {done ? (
          <span className="ml-2 text-xs text-success-fg">fait</span>
        ) : milestone.overdue ? (
          <span className="ml-2 text-xs text-danger-fg">en retard</span>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-danger-fg">
            {error}
          </p>
        ) : null}
      </div>
      {!done ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          loading={isPending}
          className="shrink-0"
          onClick={async () => {
            setIsPending(true);
            const result = await markMilestoneDoneAction(tenderId, milestone.id);
            setIsPending(false);
            if (result.error) {
              setError(result.error);
            } else {
              setDone(true);
            }
          }}
        >
          Marquer fait
        </Button>
      ) : null}
    </li>
  );
}

export function MilestonesSection({
  tenderId,
  milestones,
}: {
  tenderId: string;
  milestones: Milestone[];
}) {
  const boundAction = createMilestoneAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <Card title="Échéances">
      <div className="flex flex-col gap-2">
        {milestones.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucune échéance.</p>
        ) : (
          <ul>
            {milestones.map((milestone) => (
              <MilestoneRow key={milestone.id} tenderId={tenderId} milestone={milestone} />
            ))}
          </ul>
        )}
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <Input
            name="title"
            type="text"
            required
            placeholder="Titre..."
            className="min-w-[10rem] flex-1"
          />
          <Input
            name="date"
            type="date"
            required
            aria-label="Date de l'échéance"
            className="shrink-0 grow-0 basis-36"
          />
          {/* W4 — type et bouton passent à la ligne ENSEMBLE : mesuré à 1512 px, la rangée demandait
              570 px pour 550 disponibles et « Ajouter » glissait seul sur une ligne. */}
          <div className="flex shrink-0 grow-0 items-end gap-2">
            {/* Largeur portee par un conteneur : `Select` sans `label` ignore `wrapperClassName`. */}
            <div className="w-44">
              <Select name="type" defaultValue="CUSTOM" aria-label="Type d'échéance">
                {TYPES.map((value) => (
                  <option key={value} value={value}>
                    {MILESTONE_TYPE_LABELS[value]}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" size="sm" loading={isPending}>
              Ajouter
            </Button>
          </div>
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
