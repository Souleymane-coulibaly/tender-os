"use client";

import { useState } from "react";
import {
  fetchAnalysisSectionData,
  retryAnalysisAction,
  startTenderAnalysisAction,
} from "../../../analysis-actions";
import {
  ANALYSIS_CAPABILITY_REASON_LABELS,
  ANALYSIS_FRESHNESS_LABELS,
  ANALYSIS_STATUS_LABELS,
  CLAUSE_CATEGORY_LABELS,
  COMPLEXITY_LABELS,
  GO_NO_GO_LABELS,
  REQUIREMENT_CATEGORY_LABELS,
  type AnalysisFreshness,
  type AnalysisSectionData,
  type AnalysisStatus,
  type ClauseFinding,
  type CriterionFinding,
  type DeadlineFinding,
  type FindingProvenance,
  type QuestionFinding,
  type RequirementFinding,
  type RiskFinding,
} from "../../../../../lib/analysis-types";
import { Button } from "../../../../../components/ui/button";
import { API_ERROR_MESSAGES } from "../../../../../lib/api-error-messages";

const NON_TERMINAL_STATUSES: AnalysisStatus[] = ["PENDING", "QUEUED", "PROCESSING"];

/** Cause d'un échec d'analyse en français — jamais le code technique (`errorCode`) à l'écran. */
function analysisFailureReason(errorCode: string): string {
  return (
    ANALYSIS_CAPABILITY_REASON_LABELS[errorCode] ??
    API_ERROR_MESSAGES[errorCode] ??
    "L'analyse a échoué pour une raison technique. Relancez-la ; si l'échec persiste, contactez le support."
  );
}

function statusBadgeClass(status: AnalysisStatus): string {
  switch (status) {
    case "SUCCEEDED":
      return "bg-success-bg text-success-fg";
    case "PARTIALLY_SUCCEEDED":
      return "bg-warning-bg text-warning-fg";
    case "FAILED":
      return "bg-danger-bg text-danger-fg";
    case "CANCELLED":
      return "bg-tenderos-light text-tenderos-navy";
    default:
      return "bg-info-bg text-info-fg";
  }
}

/** Checkpoint 2.1-P2.1-FIX-A — indicateur minimal (mission §17 "pas de gros workflow Refresh, juste
 *  afficher Actualisé / Actualisation requise"). */
function freshnessBadgeClass(freshness: AnalysisFreshness): string {
  switch (freshness) {
    case "CURRENT":
      return "bg-success-bg text-success-fg";
    case "STALE":
      return "bg-warning-bg text-warning-fg";
    case "UNKNOWN":
      return "bg-tenderos-light text-tenderos-navy";
  }
}

function severityBadgeClass(severity: RiskFinding["severity"]): string {
  switch (severity) {
    case "CRITICAL":
      return "bg-danger-bg text-danger-fg";
    case "HIGH":
      return "bg-warning-bg text-warning-fg";
    case "MEDIUM":
      return "bg-warning-bg text-warning-fg";
    default:
      return "bg-tenderos-light text-tenderos-navy";
  }
}

/** Affiche la source d'une trouvaille IA (mission §"Visualiser les sources") — citation/page/
 *  section si presentes, sinon un badge "Deduit" explicite (mission §"jamais une deduction
 *  presentee comme une citation directe"). Le score de confiance est toujours affiche a cote,
 *  jamais seul (mission §"un score de confiance ne doit jamais etre utilise seul"). */
function ProvenanceLine({ provenance }: { provenance: FindingProvenance }) {
  const location = [
    provenance.pageStart !== undefined
      ? provenance.pageEnd !== undefined && provenance.pageEnd !== provenance.pageStart
        ? `p.${provenance.pageStart}-${provenance.pageEnd}`
        : `p.${provenance.pageStart}`
      : undefined,
    provenance.sheetName,
    provenance.sectionTitle,
  ]
    .filter(Boolean)
    .join(" — ");

  return (
    <p className="mt-1 text-xs text-tenderos-slate">
      {provenance.isInferred ? (
        <span className="mr-1 rounded bg-tenderos-light px-1.5 py-0.5 text-tenderos-navy">
          Deduit
        </span>
      ) : null}
      {provenance.citation ? (
        <span className="italic">&laquo;&nbsp;{provenance.citation}&nbsp;&raquo;</span>
      ) : null}
      {location ? <span className="ml-1">({location})</span> : null}
      <span className="ml-1">— confiance {Math.round(provenance.confidence * 100)}%</span>
    </p>
  );
}

function DeadlinesList({ items }: { items: DeadlineFinding[] }) {
  if (items.length === 0)
    return <p className="text-sm text-tenderos-slate">Aucune échéance détectée.</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className="border-b border-tenderos-navy/10 py-2 text-sm">
          <span className="font-medium text-tenderos-navy">{item.label}</span>
          <span className="ml-2 text-xs text-tenderos-slate">
            {item.date ? new Date(item.date).toLocaleDateString("fr-FR") : item.rawText}
          </span>
          <ProvenanceLine provenance={item} />
        </li>
      ))}
    </ul>
  );
}

function CriteriaList({ items }: { items: CriterionFinding[] }) {
  if (items.length === 0)
    return <p className="text-sm text-tenderos-slate">Aucun critère détecté.</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className="border-b border-tenderos-navy/10 py-2 text-sm">
          <span className="font-medium text-tenderos-navy">{item.name}</span>
          {item.weight !== undefined ? (
            <span className="ml-2 text-xs text-tenderos-slate">{item.weight}%</span>
          ) : null}
          {item.isEliminatory ? (
            <span className="ml-2 rounded bg-danger-bg px-1.5 py-0.5 text-xs text-danger-fg">
              Éliminatoire
            </span>
          ) : null}
          <ProvenanceLine provenance={item} />
        </li>
      ))}
    </ul>
  );
}

function RequirementsList({ items }: { items: RequirementFinding[] }) {
  if (items.length === 0)
    return <p className="text-sm text-tenderos-slate">Aucune exigence détectée.</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className="border-b border-tenderos-navy/10 py-2 text-sm">
          <span className="font-medium text-tenderos-navy">{item.label}</span>
          <span className="ml-2 text-xs text-tenderos-slate">
            {REQUIREMENT_CATEGORY_LABELS[item.category] ?? item.category}
          </span>
          {item.isMandatory ? (
            <span className="ml-2 rounded bg-tenderos-light px-1.5 py-0.5 text-xs text-tenderos-navy">
              Obligatoire
            </span>
          ) : null}
          <ProvenanceLine provenance={item} />
        </li>
      ))}
    </ul>
  );
}

function ClausesList({ items }: { items: ClauseFinding[] }) {
  if (items.length === 0)
    return <p className="text-sm text-tenderos-slate">Aucune clause détectée.</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className="border-b border-tenderos-navy/10 py-2 text-sm">
          <span className="rounded bg-tenderos-light px-1.5 py-0.5 text-xs text-tenderos-navy">
            {CLAUSE_CATEGORY_LABELS[item.category] ?? item.category}
          </span>
          <p className="mt-1 text-sm text-tenderos-navy">{item.summary}</p>
          <ProvenanceLine provenance={item} />
        </li>
      ))}
    </ul>
  );
}

function RisksList({ items }: { items: RiskFinding[] }) {
  if (items.length === 0)
    return <p className="text-sm text-tenderos-slate">Aucun risque détecté.</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className="border-b border-tenderos-navy/10 py-2 text-sm">
          <span
            className={`mr-2 rounded px-2 py-0.5 text-xs font-medium ${severityBadgeClass(item.severity)}`}
          >
            {item.severity}
          </span>
          <span className="font-medium text-tenderos-navy">{item.title}</span>
          <p className="mt-1 text-xs text-tenderos-slate">{item.explanation}</p>
          <p className="mt-1 text-xs text-tenderos-slate">
            <span className="font-medium">Recommandation :</span> {item.recommendation}
          </p>
          <ProvenanceLine provenance={item} />
        </li>
      ))}
    </ul>
  );
}

function QuestionsList({ items }: { items: QuestionFinding[] }) {
  if (items.length === 0)
    return <p className="text-sm text-tenderos-slate">Aucune question générée.</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className="border-b border-tenderos-navy/10 py-2 text-sm">
          <span className="font-medium text-tenderos-navy">{item.question}</span>
          <span className="ml-2 text-xs text-tenderos-slate">{item.theme}</span>
          <p className="mt-1 text-xs text-tenderos-slate">{item.justification}</p>
          <ProvenanceLine provenance={item} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Section "Analyse IA" de la fiche Tender (mission Sprint 4.2) — socle minimal fonctionnel,
 * explicitement PAS un tableau de bord avance : lancement/statut/actualisation/relance d'une
 * analyse Tender, et consultation des 8 categories metier avec leurs sources. `canTrigger` ne fait
 * que griser/masquer l'affichage, jamais l'autorite reelle (revalidee par l'API a chaque requete).
 */
export function AnalysisSection({
  tenderId,
  initialData,
  canTrigger,
}: {
  tenderId: string;
  initialData: AnalysisSectionData;
  canTrigger: boolean;
}) {
  const [data, setData] = useState(initialData);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function refresh(): Promise<void> {
    setIsPending(true);
    try {
      setData(await fetchAnalysisSectionData(tenderId));
      setError(undefined);
    } catch {
      setError("Impossible d'actualiser l'analyse.");
    } finally {
      setIsPending(false);
    }
  }

  async function handleStart(): Promise<void> {
    setIsPending(true);
    const result = await startTenderAnalysisAction(tenderId);
    if (result.error) {
      setError(result.error);
      setIsPending(false);
      return;
    }
    await refresh();
  }

  async function handleRetry(analysisId: string): Promise<void> {
    setIsPending(true);
    const result = await retryAnalysisAction(tenderId, analysisId);
    if (result.error) {
      setError(result.error);
      setIsPending(false);
      return;
    }
    await refresh();
  }

  const { latestJob, summary } = data;
  const isRunning = latestJob !== null && NON_TERMINAL_STATUSES.includes(latestJob.status);

  return (
    <section className="flex flex-col gap-3 rounded border border-tenderos-navy/10 p-4 md:col-span-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-tenderos-navy">Analyse IA</h2>
        <div className="flex items-center gap-2">
          {latestJob ? (
            <span
              className={`rounded px-2 py-1 text-xs font-medium ${statusBadgeClass(latestJob.status)}`}
            >
              {ANALYSIS_STATUS_LABELS[latestJob.status]}
            </span>
          ) : (
            <span className="text-xs text-tenderos-slate">Aucune analyse lancée</span>
          )}
          <Button
            type="button"
            disabled={isPending}
            onClick={refresh}
            variant="secondary"
            size="sm"
          >
            Actualiser
          </Button>
          {canTrigger && !isRunning && latestJob?.status === "FAILED" ? (
            <Button
              type="button"
              disabled={isPending}
              onClick={() => handleRetry(latestJob.id)}
              variant="secondary"
              size="sm"
            >
              Relancer
            </Button>
          ) : null}
          {canTrigger && !isRunning && latestJob?.status !== "FAILED" ? (
            <Button
              type="button"
              disabled={isPending}
              onClick={handleStart}
              variant="secondary"
              size="sm"
            >
              Lancer l&apos;analyse
            </Button>
          ) : null}
        </div>
      </div>
      {latestJob?.status === "FAILED" && latestJob.errorCode ? (
        <p role="alert" className="text-xs text-danger-fg">
          {analysisFailureReason(latestJob.errorCode)}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}

      {isRunning ? (
        <p className="text-sm text-tenderos-slate">
          Analyse en cours de traitement — cliquez sur Actualiser pour suivre la progression.
        </p>
      ) : null}

      {summary ? (
        <div className="flex flex-col gap-3 rounded border border-tenderos-navy/10 bg-tenderos-light p-3">
          <div className="flex items-center gap-2">
            <span className="rounded bg-tenderos-light px-2 py-1 text-xs font-medium text-tenderos-navy">
              Complexité : {COMPLEXITY_LABELS[summary.complexityLevel]}
            </span>
            <span className="rounded bg-info-bg px-2 py-1 text-xs font-medium text-tenderos-blue">
              {GO_NO_GO_LABELS[summary.goNoGoRecommendation]}
            </span>
            <span
              className={`rounded px-2 py-1 text-xs font-medium ${freshnessBadgeClass(summary.analysisFreshness)}`}
            >
              {ANALYSIS_FRESHNESS_LABELS[summary.analysisFreshness]}
            </span>
          </div>
          <p className="text-xs italic text-tenderos-slate">
            Recommandation d&apos;aide a la decision generee par IA — non contraignante, a valider
            par un humain.
          </p>
          <p className="text-sm text-tenderos-navy">{summary.opportunitySummary}</p>
          <p className="text-sm text-tenderos-navy">{summary.goNoGoRationale}</p>

          {summary.missingElements.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold text-tenderos-navy">Éléments manquants</h3>
              <ul className="list-disc pl-4 text-xs text-tenderos-slate">
                {summary.missingElements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {summary.pointsToClarify.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold text-tenderos-navy">Points a clarifier</h3>
              <ul className="list-disc pl-4 text-xs text-tenderos-slate">
                {summary.pointsToClarify.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-tenderos-slate">Aucune synthèse disponible pour le moment.</p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <details className="rounded border border-tenderos-navy/10 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-tenderos-navy">
            Dates et echeances ({data.deadlines.total})
          </summary>
          <div className="mt-2">
            <DeadlinesList items={data.deadlines.items} />
          </div>
        </details>
        <details className="rounded border border-tenderos-navy/10 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-tenderos-navy">
            Criteres d&apos;attribution ({data.criteria.total})
          </summary>
          <div className="mt-2">
            <CriteriaList items={data.criteria.items} />
          </div>
        </details>
        <details className="rounded border border-tenderos-navy/10 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-tenderos-navy">
            Exigences et pieces demandees ({data.requirements.total})
          </summary>
          <div className="mt-2">
            <RequirementsList items={data.requirements.items} />
          </div>
        </details>
        <details className="rounded border border-tenderos-navy/10 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-tenderos-navy">
            Clauses contractuelles ({data.clauses.total})
          </summary>
          <div className="mt-2">
            <ClausesList items={data.clauses.items} />
          </div>
        </details>
        <details className="rounded border border-tenderos-navy/10 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-tenderos-navy">
            Risques ({data.risks.total})
          </summary>
          <div className="mt-2">
            <RisksList items={data.risks.items} />
          </div>
        </details>
        <details className="rounded border border-tenderos-navy/10 p-2 md:col-span-2">
          <summary className="cursor-pointer text-xs font-semibold text-tenderos-navy">
            Questions pour l&apos;acheteur ({data.questions.total})
          </summary>
          <div className="mt-2">
            <QuestionsList items={data.questions.items} />
          </div>
        </details>
      </div>
    </section>
  );
}
