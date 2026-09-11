"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, type BadgeTone } from "../../../../../components/ui";
import { computeQuickScoreAction } from "../../../opportunity-actions";
import { LEVEL_1_CATEGORY_LABELS, type Level1Category, type OpportunityQuickScore } from "../../../../../lib/opportunity-types";

/** Design System — remplace l'ancien `scoreBadgeClass()` local : mêmes seuils (70 / 40). */
function scoreTone(score: number): BadgeTone {
  if (score >= 70) return "success";
  if (score >= 40) return "warning";
  return "danger";
}

/**
 * Quick Score Niveau 1 (mission §7-9) — TOUJOURS affiché décomposé par catégorie avec poids et
 * justification, jamais un simple pourcentage isolé. Chaque calcul crée une NOUVELLE version
 * (append-only) : ce panneau affiche toujours la plus récente, l'historique complet reste
 * accessible via l'API (`/quick-scores`), pas encore une UI dédiée ce sprint.
 */
export function OpportunityQuickScoreSection({ opportunityId, initialScore, canCompute }: { opportunityId: string; initialScore: OpportunityQuickScore | null; canCompute: boolean }) {
  const router = useRouter();
  const [score, setScore] = useState(initialScore);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleCompute(): Promise<void> {
    setIsPending(true);
    setError(undefined);
    const { score: newScore, error: actionError } = await computeQuickScoreAction(opportunityId);
    if (actionError) {
      setError(actionError);
      setIsPending(false);
      return;
    }
    setScore(newScore ?? null);
    setIsPending(false);
    // La page parente passe le dernier score à OpportunityDecisionSection (linkedQuickScoreId) —
    // sans ce rafraîchissement, elle referait référence à une version périmée (ou absente).
    router.refresh();
  }

  return (
    <Card
      title="Score de préqualification"
      actions={
        canCompute ? (
          <Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={handleCompute}>
            {isPending ? "Calcul…" : score ? "Recalculer" : "Calculer le score"}
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-3">
        {error ? (
          <p role="alert" className="text-xs text-danger-fg">
            {error}
          </p>
        ) : null}

        {!score ? (
          <p className="text-sm text-tenderos-slate">Aucun score calculé pour le moment.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={scoreTone(score.globalScore)}>{score.globalScore}/100</Badge>
              <span className="text-xs text-tenderos-slate">
                Confiance {Math.round(score.confidence * 100)}% — Complexité {score.complexity}/5 — v{score.scoreVersion}
              </span>
            </div>

            <ul className="flex flex-col gap-1 text-xs text-tenderos-slate">
              {(Object.entries(score.categoryScores) as [Level1Category, { score: number; weight: number; justification: string }][]).map(([category, entry]) => (
                <li key={category} className="flex flex-col border-b border-tenderos-navy/10 py-1">
                  <div className="flex justify-between">
                    <span className="font-medium text-tenderos-navy">{LEVEL_1_CATEGORY_LABELS[category]}</span>
                    <span>
                      {entry.score}/100 <span className="text-tenderos-slate/70">(poids {entry.weight})</span>
                    </span>
                  </div>
                  <span className="italic text-tenderos-slate">{entry.justification}</span>
                </li>
              ))}
            </ul>

            {score.blockers.length > 0 ? (
              <div className="rounded-lg bg-danger-bg p-3">
                <p className="text-xs font-semibold text-danger-fg">Blocages détectés</p>
                <ul className="mt-1 flex flex-col gap-1 text-xs text-danger-fg">
                  {score.blockers.map((blocker, i) => (
                    <li key={i}>{blocker.description}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {score.missingData.length > 0 ? (
              <div className="rounded-lg bg-warning-bg p-3">
                <p className="text-xs font-semibold text-warning-fg">Données manquantes (confiance réduite)</p>
                <ul className="mt-1 flex flex-col gap-1 text-xs text-warning-fg">
                  {score.missingData.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-xs italic text-tenderos-slate">
              Ce score est une aide à la décision, jamais une prédiction de gain — la décision finale reste humaine.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
