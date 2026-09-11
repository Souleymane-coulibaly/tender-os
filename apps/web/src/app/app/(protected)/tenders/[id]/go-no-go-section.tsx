"use client";

import { useState } from "react";
import {
  generateGoNoGoReportAction,
  recordTenderGoNoGoDecisionAction,
} from "../../../opportunity-actions";
import {
  DOCUMENTARY_LOAD_LABELS,
  GO_NO_GO_DECISION_LABELS,
  GO_NO_GO_FRESHNESS_LABELS,
  LEVEL_2_CATEGORY_LABELS,
  PREP_TIME_LABELS,
  type GoNoGoDecision,
  type GoNoGoDecisionValue,
  type GoNoGoFreshness,
  type GoNoGoRecommendation,
  type GoNoGoReport,
  type Level2Category,
} from "../../../../../lib/opportunity-types";
import { Badge, type BadgeTone } from "../../../../../components/ui/badge";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import { Alert } from "../../../../../components/ui/alert";

const DECISION_CHOICES: { value: GoNoGoDecisionValue; label: string }[] = [
  { value: "GO", label: "GO" },
  { value: "GO_CONDITIONAL", label: "GO conditionnel" },
  { value: "NO_GO", label: "NO GO" },
];

function scoreTone(score: number): BadgeTone {
  if (score >= 70) return "success";
  if (score >= 40) return "warning";
  return "danger";
}

function decisionTone(value: GoNoGoDecisionValue | GoNoGoRecommendation): BadgeTone {
  switch (value) {
    case "GO":
      return "success";
    case "GO_CONDITIONAL":
      return "warning";
    case "NO_GO":
      return "danger";
  }
}

/** Checkpoint TENDEROS-2.1-P2.3-E5.1 (Design System V2, audit hardcode) — le bouton de sélection
 *  de décision (`bg-{color}-{shade} text-white` selon la valeur) dupliquait indépendamment le
 *  mapping décision → couleur déjà porté par `decisionTone()` ci-dessus (un second switch, jamais
 *  convergé). Un bouton "sélectionné" appelle un remplissage plein (contraste texte blanc), jamais
 *  le même traitement clair qu'un `Badge` — donc ses propres classes, mais dérivées de LA seule
 *  source de vérité sémantique (`decisionTone`), jamais un second choix de couleur indépendant. */
const SELECTED_DECISION_BUTTON_CLASSES: Record<BadgeTone, string> = {
  success: "bg-success-fg text-white",
  warning: "bg-warning-fg text-white",
  danger: "bg-danger-fg text-white",
  info: "bg-info-fg text-white",
  neutral: "bg-tenderos-navy text-white",
  gold: "bg-tenderos-gold text-tenderos-navy",
};

/** Checkpoint 2.1-P2.1-FIX-C — même discipline que les badges Actualisation requise
 *  Analyse/Checklist (mission §38 "pas de faux vert"). */
function freshnessTone(freshness: GoNoGoFreshness): BadgeTone {
  switch (freshness) {
    case "CURRENT":
      return "success";
    case "STALE":
      return "warning";
    case "UNKNOWN":
      return "neutral";
  }
}

/**
 * GO/NO-GO Niveau 2 (mission §10-18) — rapport complet post-analyse DCE. La recommandation IA
 * (`report.recommendation`) et la décision humaine (`decisions`) restent TOUJOURS deux blocs
 * visuellement distincts, jamais fusionnés ni l'un présenté comme l'autre. Ne modifie JAMAIS le
 * statut du Tender (voir `RecordTenderGoNoGoDecisionUseCase`, backend) — aucun champ de statut
 * Tender n'est lu ni écrit ici.
 *
 * V2 Sprint 25F (homogénéisation UX/UI) — mission §25F.24/§25F.25/§25F.26 : écran de décision,
 * actions GO/GO conditionnel/NO GO clairement différenciées (jamais un choix accidentel), la
 * justification obligatoire reste visible AVANT validation quand le workflow l'exige — même logique
 * métier qu'avant, restylée uniquement.
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
      {
        id: "pending",
        organizationId: "",
        level: "TENDER",
        tenderId,
        decision: selected,
        justification,
        conditions,
        comment,
        actorId: "",
        decidedAt: new Date().toISOString(),
      },
      ...decisions,
    ]);
    setSelected(undefined);
    setJustification("");
    setConditions("");
    setComment("");
    setIsPending(false);
  }

  return (
    <Card
      className="md:col-span-2"
      title="Rapport GO / NO-GO (analyse complète)"
      actions={
        canGenerate ? (
          <Button
            variant="secondary"
            disabled={isPending || report?.dceStale === true}
            onClick={handleGenerate}
            title={
              report?.dceStale
                ? "Actualisez d'abord l'analyse IA du DCE avant de recalculer le GO/NO-GO."
                : undefined
            }
          >
            {isPending ? "Génération…" : report ? "Recalculer le GO/NO-GO" : "Générer le rapport"}
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

        {!report ? (
          <p className="text-sm text-tenderos-slate">
            Aucun rapport généré pour le moment. Une analyse IA du DCE doit avoir réussi avant de
            pouvoir générer ce rapport.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={scoreTone(report.globalScore)}>{report.globalScore}/100</Badge>
              <span className="text-xs text-tenderos-slate">
                Confiance {Math.round(report.confidence * 100)}% — Complexité {report.complexity}/5
              </span>
              <span className="text-xs text-tenderos-slate">
                Charge documentaire : {DOCUMENTARY_LOAD_LABELS[report.documentaryLoad]}
              </span>
              <span className="text-xs text-tenderos-slate/70">v{report.reportVersion}</span>
              {/* Checkpoint 2.1-P2.1-FIX-C — jamais un faux vert (mission §38) : ce badge reflète
                  la fraîcheur réelle vis-à-vis du DCE/de l'analyse/du candidat courants, calculée à
                  chaque lecture, jamais figée avec le rapport. */}
              {report.freshness ? (
                <Badge tone={freshnessTone(report.freshness)}>
                  {GO_NO_GO_FRESHNESS_LABELS[report.freshness]}
                </Badge>
              ) : null}
            </div>

            {report.freshness === "STALE" ? (
              <p className="text-xs text-warning-fg">
                {[
                  report.dceStale ? "Le DCE a été modifié depuis ce rapport." : null,
                  report.analysisStale ? "Une analyse plus récente est disponible." : null,
                  report.candidateStale
                    ? "L'entreprise candidate a changé depuis ce rapport."
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")}{" "}
                Actualisez l&apos;analyse puis recalculez le GO/NO-GO.
              </p>
            ) : null}

            <div className="rounded-xl bg-tenderos-light p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-tenderos-slate">
                  Recommandation IA :
                </span>
                <Badge tone={decisionTone(report.recommendation)}>
                  {GO_NO_GO_DECISION_LABELS[report.recommendation]}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-tenderos-slate">{report.recommendationRationale}</p>
              <p className="mt-1 text-xs italic text-tenderos-slate">
                Recommandation indicative — la décision finale reste exclusivement humaine.
              </p>
            </div>

            <ul className="flex flex-col gap-1 text-xs text-tenderos-slate">
              {(
                Object.entries(report.categoryScores) as [
                  Level2Category,
                  { score: number; weight: number; justification: string },
                ][]
              ).map(([category, entry]) => (
                <li
                  key={category}
                  className="flex flex-col border-b border-tenderos-navy/5 py-1 last:border-b-0"
                >
                  <div className="flex justify-between">
                    <span className="font-semibold text-tenderos-navy">
                      {LEVEL_2_CATEGORY_LABELS[category]}
                    </span>
                    <span className="tabular-nums">
                      {entry.score}/100{" "}
                      <span className="text-tenderos-slate/70">(poids {entry.weight})</span>
                    </span>
                  </div>
                  <span className="italic">{entry.justification}</span>
                </li>
              ))}
            </ul>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-tenderos-slate">
                  Temps de préparation estimé
                </h3>
                <ul className="mt-1 text-xs text-tenderos-slate">
                  <li>
                    Administratif : {PREP_TIME_LABELS[report.estimatedPrepTime.administratif]}
                  </li>
                  <li>
                    Mémoire technique :{" "}
                    {PREP_TIME_LABELS[report.estimatedPrepTime.memoireTechnique]}
                  </li>
                  <li>Pricing : {PREP_TIME_LABELS[report.estimatedPrepTime.pricing]}</li>
                  <li>Documents : {PREP_TIME_LABELS[report.estimatedPrepTime.documents]}</li>
                  <li>Validation : {PREP_TIME_LABELS[report.estimatedPrepTime.validation]}</li>
                </ul>
                <p className="mt-1 text-xs italic text-tenderos-slate">
                  Estimation indicative, jamais une garantie.
                </p>
              </div>

              {report.risks.length > 0 ? (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-tenderos-slate">
                    Risques identifiés
                  </h3>
                  <ul className="mt-1 flex flex-col gap-1 text-xs text-tenderos-slate">
                    {report.risks.map((risk, i) => (
                      <li key={i}>{risk.description}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {report.blockers.length > 0 ? (
              <Alert tone="danger" title="Blocages détectés (facteurs, jamais un blocage automatique de la décision)">
                <ul className="mt-1 flex flex-col gap-1 text-xs text-danger-fg">
                  {report.blockers.map((blocker, i) => (
                    <li key={i}>{blocker.description}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}

            {report.missingInfo.length > 0 ? (
              <Alert tone="warning" title="Informations manquantes">
                <ul className="mt-1 flex flex-col gap-1 text-xs text-warning-fg">
                  {report.missingInfo.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}

            {report.subcontractingFlags.length > 0 ? (
              <div className="rounded-xl border border-tenderos-blue/20 bg-tenderos-blue/5 p-3">
                <p className="text-xs font-semibold text-tenderos-blue">
                  Signaux de sous-traitance / groupement (facteur informatif uniquement)
                </p>
                <ul className="mt-1 flex flex-col gap-1 text-xs text-tenderos-navy">
                  {report.subcontractingFlags.map((flag, i) => (
                    <li key={i}>{flag}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}

        <div className="mt-2 border-t border-tenderos-navy/10 pt-3">
          <h3 className="font-tenderos-display text-sm font-bold text-tenderos-navy">
            Décision humaine GO / NO-GO
          </h3>

          {canDecide ? (
            <div className="mt-2 flex flex-col gap-3 rounded-xl bg-tenderos-light p-3">
              <div className="flex flex-wrap gap-2">
                {DECISION_CHOICES.map((choice) => {
                  const isSelected = selected === choice.value;
                  return (
                    <button
                      key={choice.value}
                      type="button"
                      onClick={() => setSelected(choice.value)}
                      aria-pressed={isSelected}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                        isSelected
                          ? SELECTED_DECISION_BUTTON_CLASSES[decisionTone(choice.value)]
                          : "border border-tenderos-navy/15 bg-white text-tenderos-navy hover:bg-tenderos-light"
                      }`}
                    >
                      {choice.label}
                    </button>
                  );
                })}
              </div>

              {selected === "NO_GO" ? (
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="tender-justification"
                    className="text-xs font-medium text-tenderos-navy"
                  >
                    Justification (obligatoire)
                  </label>
                  <textarea
                    id="tender-justification"
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    rows={2}
                    className="rounded-lg border border-tenderos-navy/15 px-3 py-2 text-sm"
                  />
                </div>
              ) : null}

              {selected === "GO_CONDITIONAL" ? (
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="tender-conditions"
                    className="text-xs font-medium text-tenderos-navy"
                  >
                    Conditions (obligatoire)
                  </label>
                  <textarea
                    id="tender-conditions"
                    value={conditions}
                    onChange={(e) => setConditions(e.target.value)}
                    rows={2}
                    className="rounded-lg border border-tenderos-navy/15 px-3 py-2 text-sm"
                  />
                </div>
              ) : null}

              {selected ? (
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="tender-comment"
                    className="text-xs font-medium text-tenderos-navy"
                  >
                    Commentaire (facultatif)
                  </label>
                  <textarea
                    id="tender-comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                    className="rounded-lg border border-tenderos-navy/15 px-3 py-2 text-sm"
                  />
                </div>
              ) : null}

              {selected ? (
                <Button
                  variant="primary"
                  className="self-start"
                  disabled={isPending}
                  onClick={handleSubmitDecision}
                >
                  {isPending ? "Enregistrement…" : "Enregistrer la décision"}
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="mt-1 text-xs text-tenderos-slate">
              L&apos;enregistrement d&apos;une décision est réservé aux rôles OWNER / ADMIN /
              BID_MANAGER.
            </p>
          )}

          {decisions.length === 0 ? (
            <p className="mt-2 text-sm text-tenderos-slate">Aucune décision enregistrée.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {decisions.map((decision) => (
                <li
                  key={decision.id}
                  className="border-b border-tenderos-navy/5 py-2 text-sm last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <Badge tone={decisionTone(decision.decision)}>
                      {GO_NO_GO_DECISION_LABELS[decision.decision]}
                    </Badge>
                    <span className="text-xs text-tenderos-slate">
                      {new Date(decision.decidedAt).toLocaleString("fr-FR")}
                    </span>
                  </div>
                  {decision.justification ? (
                    <p className="mt-1 text-xs text-tenderos-navy">{decision.justification}</p>
                  ) : null}
                  {decision.conditions ? (
                    <p className="mt-1 text-xs text-tenderos-navy">
                      Conditions : {decision.conditions}
                    </p>
                  ) : null}
                  {decision.comment ? (
                    <p className="mt-1 text-xs italic text-tenderos-slate">{decision.comment}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
