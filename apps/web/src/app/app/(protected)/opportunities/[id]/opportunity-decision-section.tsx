"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { recordOpportunityDecisionAction } from "../../../opportunity-actions";
import { GO_NO_GO_DECISION_LABELS, goNoGoBadgeClass, type GoNoGoDecision, type GoNoGoDecisionValue } from "../../../../../lib/opportunity-types";

const DECISION_CHOICES: { value: GoNoGoDecisionValue; label: string }[] = [
  { value: "GO", label: "GO" },
  { value: "GO_CONDITIONAL", label: "GO conditionnel" },
  { value: "NO_GO", label: "NO GO" },
];

/**
 * Décision humaine Niveau OPPORTUNITY (mission §18) — la recommandation IA n'existe pas encore à
 * ce niveau (Niveau 1 = score, pas de recommandation formelle) ; ici, c'est une décision 100%
 * humaine. Justification obligatoire pour NO GO, conditions obligatoires pour GO conditionnel —
 * revalidé côté backend quoi que montre ce formulaire.
 */
export function OpportunityDecisionSection({
  opportunityId,
  initialDecisions,
  canDecide,
  latestQuickScoreId,
}: {
  opportunityId: string;
  initialDecisions: GoNoGoDecision[];
  canDecide: boolean;
  latestQuickScoreId: string | undefined;
}) {
  const router = useRouter();
  const [decisions, setDecisions] = useState(initialDecisions);
  const [selected, setSelected] = useState<GoNoGoDecisionValue | undefined>();
  const [justification, setJustification] = useState("");
  const [conditions, setConditions] = useState("");
  const [comment, setComment] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(): Promise<void> {
    if (!selected) return;
    setIsPending(true);
    setError(undefined);
    const state = await recordOpportunityDecisionAction(opportunityId, {
      decision: selected,
      justification: justification.trim() || undefined,
      conditions: conditions.trim() || undefined,
      comment: comment.trim() || undefined,
      linkedQuickScoreId: latestQuickScoreId,
    });
    if (state.error) {
      setError(state.error);
      setIsPending(false);
      return;
    }
    setDecisions([
      { id: "pending", organizationId: "", level: "OPPORTUNITY", opportunityId, decision: selected, justification, conditions, comment, actorId: "", decidedAt: new Date().toISOString() },
      ...decisions,
    ]);
    setSelected(undefined);
    setJustification("");
    setConditions("");
    setComment("");
    setIsPending(false);
    // Une décision Niveau OPPORTUNITY synchronise Opportunity.status côté serveur (mission §18) —
    // sans ce rafraîchissement, le badge de statut et la visibilité du bouton "Promouvoir" (tous
    // deux rendus côté serveur dans la page parente) resteraient périmés jusqu'au prochain
    // rechargement manuel.
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold text-neutral-700">Décision GO / NO-GO</h2>

      {canDecide ? (
        <div className="flex flex-col gap-2 rounded border border-neutral-100 bg-neutral-50 p-3">
          <div className="flex gap-2">
            {DECISION_CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                onClick={() => setSelected(choice.value)}
                className={`rounded px-3 py-1.5 text-xs font-medium ${selected === choice.value ? goNoGoBadgeClass(choice.value) : "border border-neutral-300 text-neutral-600"}`}
              >
                {choice.label}
              </button>
            ))}
          </div>

          {selected === "NO_GO" ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="justification" className="text-xs font-medium text-neutral-700">
                Justification (obligatoire)
              </label>
              <textarea id="justification" value={justification} onChange={(e) => setJustification(e.target.value)} rows={2} className="rounded border border-neutral-300 px-2 py-1 text-sm" />
            </div>
          ) : null}

          {selected === "GO_CONDITIONAL" ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="conditions" className="text-xs font-medium text-neutral-700">
                Conditions (obligatoire)
              </label>
              <textarea id="conditions" value={conditions} onChange={(e) => setConditions(e.target.value)} rows={2} className="rounded border border-neutral-300 px-2 py-1 text-sm" />
            </div>
          ) : null}

          {selected ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="comment" className="text-xs font-medium text-neutral-700">
                Commentaire (facultatif)
              </label>
              <textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="rounded border border-neutral-300 px-2 py-1 text-sm" />
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          ) : null}

          {selected ? (
            <button type="button" disabled={isPending} onClick={handleSubmit} className="self-start rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              {isPending ? "Enregistrement…" : "Enregistrer la décision"}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-neutral-500">L&apos;enregistrement d&apos;une décision est réservé aux rôles OWNER / ADMIN / BID_MANAGER.</p>
      )}

      <div>
        <h3 className="text-xs font-semibold uppercase text-neutral-500">Historique</h3>
        {decisions.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-500">Aucune décision enregistrée.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-2">
            {decisions.map((decision) => (
              <li key={decision.id} className="border-b border-neutral-100 py-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${goNoGoBadgeClass(decision.decision)}`}>{GO_NO_GO_DECISION_LABELS[decision.decision]}</span>
                  <span className="text-xs text-neutral-500">{new Date(decision.decidedAt).toLocaleString("fr-FR")}</span>
                </div>
                {decision.justification ? <p className="mt-1 text-xs text-neutral-700">{decision.justification}</p> : null}
                {decision.conditions ? <p className="mt-1 text-xs text-neutral-700">Conditions : {decision.conditions}</p> : null}
                {decision.comment ? <p className="mt-1 text-xs italic text-neutral-500">{decision.comment}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
