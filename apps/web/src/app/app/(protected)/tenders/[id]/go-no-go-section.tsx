"use client";

import { useState } from "react";
import { generateGoNoGoReportAction, recordTenderGoNoGoDecisionAction } from "../../../opportunity-actions";
import {
  DOCUMENTARY_LOAD_LABELS,
  GO_NO_GO_DECISION_LABELS,
  goNoGoBadgeClass,
  LEVEL_2_CATEGORY_LABELS,
  PREP_TIME_LABELS,
  type GoNoGoDecision,
  type GoNoGoDecisionValue,
  type GoNoGoReport,
  type Level2Category,
} from "../../../../../lib/opportunity-types";

const DECISION_CHOICES: { value: GoNoGoDecisionValue; label: string }[] = [
  { value: "GO", label: "GO" },
  { value: "GO_CONDITIONAL", label: "GO conditionnel" },
  { value: "NO_GO", label: "NO GO" },
];

function scoreBadgeClass(score: number): string {
  if (score >= 70) return "bg-green-100 text-green-800";
  if (score >= 40) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

/**
 * GO/NO-GO Niveau 2 (mission §10-18) — rapport complet post-analyse DCE. La recommandation IA
 * (`report.recommendation`) et la décision humaine (`decisions`) restent TOUJOURS deux blocs
 * visuellement distincts, jamais fusionnés ni l'un présenté comme l'autre. Ne modifie JAMAIS le
 * statut du Tender (voir `RecordTenderGoNoGoDecisionUseCase`, backend) — aucun champ de statut
 * Tender n'est lu ni écrit ici.
 */
export function GoNoGoSection({
  tenderId,
  initialReport,
  initialDecisions,
  canGenerate,
  canDecide,
}: {
  tenderId: string;
  initialReport: GoNoGoReport | null;
  initialDecisions: GoNoGoDecision[];
  canGenerate: boolean;
  canDecide: boolean;
}) {
  const [report, setReport] = useState(initialReport);
  const [decisions, setDecisions] = useState(initialDecisions);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [selected, setSelected] = useState<GoNoGoDecisionValue | undefined>();
  const [justification, setJustification] = useState("");
  const [conditions, setConditions] = useState("");
  const [comment, setComment] = useState("");

  async function handleGenerate(): Promise<void> {
    setIsPending(true);
    setError(undefined);
    const { report: newReport, error: actionError } = await generateGoNoGoReportAction(tenderId);
    if (actionError) {
      setError(actionError);
      setIsPending(false);
      return;
    }
    setReport(newReport ?? null);
    setIsPending(false);
  }

  async function handleSubmitDecision(): Promise<void> {
    if (!selected) return;
    setIsPending(true);
    setError(undefined);
    const state = await recordTenderGoNoGoDecisionAction(tenderId, {
      decision: selected,
      justification: justification.trim() || undefined,
      conditions: conditions.trim() || undefined,
      comment: comment.trim() || undefined,
      linkedReportId: report?.id,
    });
    if (state.error) {
      setError(state.error);
      setIsPending(false);
      return;
    }
    setDecisions([
      { id: "pending", organizationId: "", level: "TENDER", tenderId, decision: selected, justification, conditions, comment, actorId: "", decidedAt: new Date().toISOString() },
      ...decisions,
    ]);
    setSelected(undefined);
    setJustification("");
    setConditions("");
    setComment("");
    setIsPending(false);
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4 md:col-span-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-700">Rapport GO / NO-GO (analyse complète)</h2>
        {canGenerate ? (
          <button type="button" disabled={isPending} onClick={handleGenerate} className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 disabled:opacity-50">
            {isPending ? "Génération…" : report ? "Régénérer le rapport" : "Générer le rapport"}
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}

      {!report ? (
        <p className="text-sm text-neutral-500">
          Aucun rapport généré pour le moment. Une analyse IA du DCE doit avoir réussi avant de pouvoir générer ce rapport.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded px-2 py-1 text-sm font-semibold ${scoreBadgeClass(report.globalScore)}`}>{report.globalScore}/100</span>
            <span className="text-xs text-neutral-500">Confiance {Math.round(report.confidence * 100)}% — Complexité {report.complexity}/5</span>
            <span className="text-xs text-neutral-500">Charge documentaire : {DOCUMENTARY_LOAD_LABELS[report.documentaryLoad]}</span>
            <span className="text-xs text-neutral-400">v{report.reportVersion}</span>
          </div>

          <div className="rounded border border-neutral-100 bg-neutral-50 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-neutral-500">Recommandation IA :</span>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${goNoGoBadgeClass(report.recommendation)}`}>{GO_NO_GO_DECISION_LABELS[report.recommendation]}</span>
            </div>
            <p className="mt-1 text-xs text-neutral-600">{report.recommendationRationale}</p>
            <p className="mt-1 text-xs italic text-neutral-500">Recommandation indicative — la décision finale reste exclusivement humaine.</p>
          </div>

          <ul className="flex flex-col gap-1 text-xs text-neutral-600">
            {(Object.entries(report.categoryScores) as [Level2Category, { score: number; weight: number; justification: string }][]).map(([category, entry]) => (
              <li key={category} className="flex flex-col border-b border-neutral-100 py-1">
                <div className="flex justify-between">
                  <span className="font-medium text-neutral-800">{LEVEL_2_CATEGORY_LABELS[category]}</span>
                  <span>
                    {entry.score}/100 <span className="text-neutral-400">(poids {entry.weight})</span>
                  </span>
                </div>
                <span className="italic text-neutral-500">{entry.justification}</span>
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase text-neutral-500">Temps de préparation estimé</h3>
              <ul className="mt-1 text-xs text-neutral-600">
                <li>Administratif : {PREP_TIME_LABELS[report.estimatedPrepTime.administratif]}</li>
                <li>Mémoire technique : {PREP_TIME_LABELS[report.estimatedPrepTime.memoireTechnique]}</li>
                <li>Pricing : {PREP_TIME_LABELS[report.estimatedPrepTime.pricing]}</li>
                <li>Documents : {PREP_TIME_LABELS[report.estimatedPrepTime.documents]}</li>
                <li>Validation : {PREP_TIME_LABELS[report.estimatedPrepTime.validation]}</li>
              </ul>
              <p className="mt-1 text-xs italic text-neutral-500">Estimation indicative, jamais une garantie.</p>
            </div>

            {report.risks.length > 0 ? (
              <div>
                <h3 className="text-xs font-semibold uppercase text-neutral-500">Risques identifiés</h3>
                <ul className="mt-1 flex flex-col gap-1 text-xs text-neutral-600">
                  {report.risks.map((risk, i) => (
                    <li key={i}>{risk.description}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {report.blockers.length > 0 ? (
            <div className="rounded border border-red-200 bg-red-50 p-2">
              <p className="text-xs font-semibold text-red-800">Blocages détectés (facteurs, jamais un blocage automatique de la décision)</p>
              <ul className="mt-1 flex flex-col gap-1 text-xs text-red-700">
                {report.blockers.map((blocker, i) => (
                  <li key={i}>{blocker.description}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {report.missingInfo.length > 0 ? (
            <div className="rounded border border-amber-200 bg-amber-50 p-2">
              <p className="text-xs font-semibold text-amber-800">Informations manquantes</p>
              <ul className="mt-1 flex flex-col gap-1 text-xs text-amber-700">
                {report.missingInfo.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {report.subcontractingFlags.length > 0 ? (
            <div className="rounded border border-blue-200 bg-blue-50 p-2">
              <p className="text-xs font-semibold text-blue-800">Signaux de sous-traitance / groupement (facteur informatif uniquement)</p>
              <ul className="mt-1 flex flex-col gap-1 text-xs text-blue-700">
                {report.subcontractingFlags.map((flag, i) => (
                  <li key={i}>{flag}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      <div className="mt-2 border-t border-neutral-200 pt-3">
        <h3 className="text-sm font-semibold text-neutral-700">Décision humaine GO / NO-GO</h3>

        {canDecide ? (
          <div className="mt-2 flex flex-col gap-2 rounded border border-neutral-100 bg-neutral-50 p-3">
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
                <label htmlFor="tender-justification" className="text-xs font-medium text-neutral-700">
                  Justification (obligatoire)
                </label>
                <textarea id="tender-justification" value={justification} onChange={(e) => setJustification(e.target.value)} rows={2} className="rounded border border-neutral-300 px-2 py-1 text-sm" />
              </div>
            ) : null}

            {selected === "GO_CONDITIONAL" ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="tender-conditions" className="text-xs font-medium text-neutral-700">
                  Conditions (obligatoire)
                </label>
                <textarea id="tender-conditions" value={conditions} onChange={(e) => setConditions(e.target.value)} rows={2} className="rounded border border-neutral-300 px-2 py-1 text-sm" />
              </div>
            ) : null}

            {selected ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="tender-comment" className="text-xs font-medium text-neutral-700">
                  Commentaire (facultatif)
                </label>
                <textarea id="tender-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="rounded border border-neutral-300 px-2 py-1 text-sm" />
              </div>
            ) : null}

            {selected ? (
              <button type="button" disabled={isPending} onClick={handleSubmitDecision} className="self-start rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                {isPending ? "Enregistrement…" : "Enregistrer la décision"}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="mt-1 text-xs text-neutral-500">L&apos;enregistrement d&apos;une décision est réservé aux rôles OWNER / ADMIN / BID_MANAGER.</p>
        )}

        {decisions.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Aucune décision enregistrée.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
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
