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
import type { Milestone, MilestoneType } from "../../../../../lib/tenders-types";

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
    <Card title="Echeances">
      <div className="flex flex-col gap-2">
        {milestones.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucune echeance.</p>
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
            aria-label="Date de l'echeance"
            className="shrink-0 grow-0 basis-36"
          />
          {/* Largeur portee par un conteneur : `Select` sans `label` ignore `wrapperClassName`. */}
          <div className="shrink-0 grow-0 basis-44">
            <Select name="type" defaultValue="CUSTOM" aria-label="Type d'echeance">
              {TYPES.map((value) => (
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
