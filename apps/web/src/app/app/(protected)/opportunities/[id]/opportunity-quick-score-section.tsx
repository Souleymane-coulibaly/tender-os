"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { computeQuickScoreAction } from "../../../opportunity-actions";
import { LEVEL_1_CATEGORY_LABELS, type Level1Category, type OpportunityQuickScore } from "../../../../../lib/opportunity-types";

function scoreBadgeClass(score: number): string {
  if (score >= 70) return "bg-green-100 text-green-800";
  if (score >= 40) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
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
    <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-700">Score de préqualification</h2>
        {canCompute ? (
          <button type="button" disabled={isPending} onClick={handleCompute} className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 disabled:opacity-50">
            {isPending ? "Calcul…" : score ? "Recalculer" : "Calculer le score"}
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}

      {!score ? (
        <p className="text-sm text-neutral-500">Aucun score calculé pour le moment.</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className={`rounded px-2 py-1 text-sm font-semibold ${scoreBadgeClass(score.globalScore)}`}>{score.globalScore}/100</span>
            <span className="text-xs text-neutral-500">Confiance {Math.round(score.confidence * 100)}% — Complexité {score.complexity}/5 — v{score.scoreVersion}</span>
          </div>

          <ul className="flex flex-col gap-1 text-xs text-neutral-600">
            {(Object.entries(score.categoryScores) as [Level1Category, { score: number; weight: number; justification: string }][]).map(([category, entry]) => (
              <li key={category} className="flex flex-col border-b border-neutral-100 py-1">
                <div className="flex justify-between">
                  <span className="font-medium text-neutral-800">{LEVEL_1_CATEGORY_LABELS[category]}</span>
                  <span>
                    {entry.score}/100 <span className="text-neutral-400">(poids {entry.weight})</span>
                  </span>
                </div>
                <span className="italic text-neutral-500">{entry.justification}</span>
              </li>
            ))}
          </ul>

          {score.blockers.length > 0 ? (
            <div className="rounded border border-red-200 bg-red-50 p-2">
              <p className="text-xs font-semibold text-red-800">Blocages détectés</p>
              <ul className="mt-1 flex flex-col gap-1 text-xs text-red-700">
                {score.blockers.map((blocker, i) => (
                  <li key={i}>{blocker.description}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {score.missingData.length > 0 ? (
            <div className="rounded border border-amber-200 bg-amber-50 p-2">
              <p className="text-xs font-semibold text-amber-800">Données manquantes (confiance réduite)</p>
              <ul className="mt-1 flex flex-col gap-1 text-xs text-amber-700">
                {score.missingData.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-xs italic text-neutral-500">
            Ce score est une aide à la décision, jamais une prédiction de gain — la décision finale reste humaine.
          </p>
        </>
      )}
    </section>
  );
}
