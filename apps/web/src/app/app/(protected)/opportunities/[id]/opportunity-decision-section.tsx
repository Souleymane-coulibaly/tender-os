"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button, Card, Textarea, type BadgeTone } from "../../../../../components/ui";
import { recordOpportunityDecisionAction } from "../../../opportunity-actions";
import { GO_NO_GO_DECISION_LABELS, GO_NO_GO_TONE, type GoNoGoDecision, type GoNoGoDecisionValue } from "../../../../../lib/opportunity-types";

const DECISION_CHOICES: { value: GoNoGoDecisionValue; label: string }[] = [
  { value: "GO", label: "GO" },
  { value: "GO_CONDITIONAL", label: "GO conditionnel" },
  { value: "NO_GO", label: "NO GO" },
];

/** Bouton de choix sélectionné : teinte claire de l'état, dérivée de LA seule source sémantique
 *  (`GO_NO_GO_TONE`), jamais un second choix de couleur par décision. Un bouton bascule n'est pas un
 *  `Badge` (ni une variante de `Button`), d'où ce jeu de classes propre. */
const SELECTED_CHOICE_CLASSES: Record<BadgeTone, string> = {
  success: "bg-success-bg text-success-fg",
  warning: "bg-warning-bg text-warning-fg",
  danger: "bg-danger-bg text-danger-fg",
  info: "bg-info-bg text-info-fg",
  neutral: "bg-tenderos-light text-tenderos-navy",
  gold: "bg-tenderos-gold/15 text-tenderos-navy",
};

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
  decisionAllowedFromStatus,
  latestQuickScoreId,
}: {
  opportunityId: string;
  initialDecisions: GoNoGoDecision[];
  canDecide: boolean;
  /** Checkpoint TENDEROS-2.1 (correctif UX, remonté en usage réel) — le formulaire s'affichait dès
   *  que le RÔLE le permettait, sans jamais regarder le STATUT : sur une opportunité en
   *  DRAFT/TO_QUALIFY (l'état de toute opportunité fraîchement créée ou promue depuis la Veille),
   *  l'utilisateur pouvait choisir une décision et cliquer "Enregistrer" pour n'obtenir qu'un 409.
   *  La table de transitions (`ALLOWED_OPPORTUNITY_TRANSITIONS`, backend) n'autorise GO/GO_CONDITIONAL/
   *  NO_GO que depuis QUALIFIED (ou depuis une décision précédente). Même discipline que le bouton
   *  "Promouvoir" de la page parente, qui teste déjà rôle ET statut — jamais un bouton mort. */
  decisionAllowedFromStatus: boolean;
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
    <Card title="Décision GO / NO-GO">
      <div className="flex flex-col gap-3">
        {canDecide && !decisionAllowedFromStatus ? (
          <Alert tone="warning">
            Cette opportunité doit d&apos;abord être <strong>qualifiée</strong> pour recevoir une décision GO/NO-GO. Utilisez le statut ci-dessus : «&nbsp;À qualifier&nbsp;» puis
            «&nbsp;Qualifiée&nbsp;».
          </Alert>
        ) : null}

        {canDecide && decisionAllowedFromStatus ? (
          <div className="flex flex-col gap-2 rounded-lg bg-tenderos-light p-3">
            {/* Boutons bascule (choix exclusif) : volontairement hors `Button`, dont aucune variante
                ne porte la teinte d'état de la décision sélectionnée. */}
            <div className="flex flex-wrap gap-2">
              {DECISION_CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => setSelected(choice.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    selected === choice.value
                      ? SELECTED_CHOICE_CLASSES[GO_NO_GO_TONE[choice.value]]
                      : "border border-tenderos-navy/15 bg-white text-tenderos-slate hover:bg-tenderos-light"
                  }`}
                >
                  {choice.label}
                </button>
              ))}
            </div>

            {selected === "NO_GO" ? (
              <Textarea id="justification" label="Justification (obligatoire)" value={justification} onChange={(e) => setJustification(e.target.value)} rows={2} />
            ) : null}

            {selected === "GO_CONDITIONAL" ? (
              <Textarea id="conditions" label="Conditions (obligatoire)" value={conditions} onChange={(e) => setConditions(e.target.value)} rows={2} />
            ) : null}

            {selected ? <Textarea id="comment" label="Commentaire (facultatif)" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} /> : null}

            {error ? (
              <p role="alert" className="text-xs text-danger-fg">
                {error}
              </p>
            ) : null}

            {selected ? (
              <Button type="button" variant="primary" size="sm" disabled={isPending} onClick={handleSubmit} className="self-start">
                {isPending ? "Enregistrement…" : "Enregistrer la décision"}
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-tenderos-slate">L&apos;enregistrement d&apos;une décision est réservé aux rôles OWNER / ADMIN / BID_MANAGER.</p>
        )}

        <div>
          <h3 className="text-sm font-semibold text-tenderos-navy">Historique</h3>
          {decisions.length === 0 ? (
            <p className="mt-1 text-sm text-tenderos-slate">Aucune décision enregistrée.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-2">
              {decisions.map((decision) => (
                <li key={decision.id} className="border-b border-tenderos-navy/10 py-1 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone={GO_NO_GO_TONE[decision.decision]}>{GO_NO_GO_DECISION_LABELS[decision.decision]}</Badge>
                    <span className="text-xs text-tenderos-slate">{new Date(decision.decidedAt).toLocaleString("fr-FR")}</span>
                  </div>
                  {decision.justification ? <p className="mt-1 text-xs text-tenderos-navy">{decision.justification}</p> : null}
                  {decision.conditions ? <p className="mt-1 text-xs text-tenderos-navy">Conditions : {decision.conditions}</p> : null}
                  {decision.comment ? <p className="mt-1 text-xs italic text-tenderos-slate">{decision.comment}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
