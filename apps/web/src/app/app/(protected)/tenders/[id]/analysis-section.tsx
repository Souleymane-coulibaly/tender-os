"use client";

import { useState } from "react";
import { fetchAnalysisSectionData, retryAnalysisAction, startTenderAnalysisAction } from "../../../analysis-actions";
import {
  ANALYSIS_STATUS_LABELS,
  COMPLEXITY_LABELS,
  GO_NO_GO_LABELS,
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

const NON_TERMINAL_STATUSES: AnalysisStatus[] = ["PENDING", "QUEUED", "PROCESSING"];

function statusBadgeClass(status: AnalysisStatus): string {
  switch (status) {
    case "SUCCEEDED":
      return "bg-green-100 text-green-800";
    case "PARTIALLY_SUCCEEDED":
      return "bg-amber-100 text-amber-800";
    case "FAILED":
      return "bg-red-100 text-red-800";
    case "CANCELLED":
      return "bg-neutral-200 text-neutral-700";
    default:
      return "bg-blue-100 text-blue-800";
  }
}

function severityBadgeClass(severity: RiskFinding["severity"]): string {
  switch (severity) {
    case "CRITICAL":
      return "bg-red-100 text-red-800";
    case "HIGH":
      return "bg-orange-100 text-orange-800";
    case "MEDIUM":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-neutral-100 text-neutral-700";
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
    <p className="mt-1 text-xs text-neutral-500">
      {provenance.isInferred ? <span className="mr-1 rounded bg-neutral-200 px-1.5 py-0.5 text-neutral-700">Deduit</span> : null}
      {provenance.citation ? <span className="italic">&laquo;&nbsp;{provenance.citation}&nbsp;&raquo;</span> : null}
      {location ? <span className="ml-1">({location})</span> : null}
      <span className="ml-1">— confiance {Math.round(provenance.confidence * 100)}%</span>
    </p>
  );
}

function DeadlinesList({ items }: { items: DeadlineFinding[] }) {
  if (items.length === 0) return <p className="text-sm text-neutral-500">Aucune echeance detectee.</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className="border-b border-neutral-100 py-2 text-sm">
          <span className="font-medium text-neutral-900">{item.label}</span>
          <span className="ml-2 text-xs text-neutral-500">
            {item.date ? new Date(item.date).toLocaleDateString("fr-FR") : item.rawText}
          </span>
          <ProvenanceLine provenance={item} />
        </li>
      ))}
    </ul>
  );
}

function CriteriaList({ items }: { items: CriterionFinding[] }) {
  if (items.length === 0) return <p className="text-sm text-neutral-500">Aucun critere detecte.</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className="border-b border-neutral-100 py-2 text-sm">
          <span className="font-medium text-neutral-900">{item.name}</span>
          {item.weight !== undefined ? <span className="ml-2 text-xs text-neutral-500">{item.weight}%</span> : null}
          {item.isEliminatory ? <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">Eliminatoire</span> : null}
          <ProvenanceLine provenance={item} />
        </li>
      ))}
    </ul>
  );
}

function RequirementsList({ items }: { items: RequirementFinding[] }) {
  if (items.length === 0) return <p className="text-sm text-neutral-500">Aucune exigence detectee.</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className="border-b border-neutral-100 py-2 text-sm">
          <span className="font-medium text-neutral-900">{item.label}</span>
          <span className="ml-2 text-xs text-neutral-500">{item.category}</span>
          {item.isMandatory ? <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700">Obligatoire</span> : null}
          <ProvenanceLine provenance={item} />
        </li>
      ))}
    </ul>
  );
}

function ClausesList({ items }: { items: ClauseFinding[] }) {
  if (items.length === 0) return <p className="text-sm text-neutral-500">Aucune clause detectee.</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className="border-b border-neutral-100 py-2 text-sm">
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700">{item.category}</span>
          <p className="mt-1 text-sm text-neutral-700">{item.summary}</p>
          <ProvenanceLine provenance={item} />
        </li>
      ))}
    </ul>
  );
}

function RisksList({ items }: { items: RiskFinding[] }) {
  if (items.length === 0) return <p className="text-sm text-neutral-500">Aucun risque detecte.</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className="border-b border-neutral-100 py-2 text-sm">
          <span className={`mr-2 rounded px-2 py-0.5 text-xs font-medium ${severityBadgeClass(item.severity)}`}>{item.severity}</span>
          <span className="font-medium text-neutral-900">{item.title}</span>
          <p className="mt-1 text-xs text-neutral-600">{item.explanation}</p>
          <p className="mt-1 text-xs text-neutral-600">
            <span className="font-medium">Recommandation :</span> {item.recommendation}
          </p>
          <ProvenanceLine provenance={item} />
        </li>
      ))}
    </ul>
  );
}

function QuestionsList({ items }: { items: QuestionFinding[] }) {
  if (items.length === 0) return <p className="text-sm text-neutral-500">Aucune question generee.</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className="border-b border-neutral-100 py-2 text-sm">
          <span className="font-medium text-neutral-900">{item.question}</span>
          <span className="ml-2 text-xs text-neutral-500">{item.theme}</span>
          <p className="mt-1 text-xs text-neutral-600">{item.justification}</p>
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
    <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4 md:col-span-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-700">Analyse IA</h2>
        <div className="flex items-center gap-2">
          {latestJob ? (
            <span className={`rounded px-2 py-1 text-xs font-medium ${statusBadgeClass(latestJob.status)}`}>
              {ANALYSIS_STATUS_LABELS[latestJob.status]}
              {latestJob.status === "FAILED" && latestJob.errorCode ? ` — ${latestJob.errorCode}` : null}
            </span>
          ) : (
            <span className="text-xs text-neutral-500">Aucune analyse lancee</span>
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={refresh}
            className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 disabled:opacity-50"
          >
            Actualiser
          </button>
          {canTrigger && !isRunning && latestJob?.status === "FAILED" ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleRetry(latestJob.id)}
              className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 disabled:opacity-50"
            >
              Relancer
            </button>
          ) : null}
          {canTrigger && !isRunning && latestJob?.status !== "FAILED" ? (
            <button
              type="button"
              disabled={isPending}
              onClick={handleStart}
              className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 disabled:opacity-50"
            >
              Lancer l&apos;analyse
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}

      {isRunning ? <p className="text-sm text-neutral-500">Analyse en cours de traitement — cliquez sur Actualiser pour suivre la progression.</p> : null}

      {summary ? (
        <div className="flex flex-col gap-3 rounded border border-neutral-100 bg-neutral-50 p-3">
          <div className="flex items-center gap-2">
            <span className="rounded bg-neutral-200 px-2 py-1 text-xs font-medium text-neutral-800">
              Complexite : {COMPLEXITY_LABELS[summary.complexityLevel]}
            </span>
            <span className="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-900">
              {GO_NO_GO_LABELS[summary.goNoGoRecommendation]}
            </span>
          </div>
          <p className="text-xs italic text-neutral-500">
            Recommandation d&apos;aide a la decision generee par IA — non contraignante, a valider par un humain.
          </p>
          <p className="text-sm text-neutral-700">{summary.opportunitySummary}</p>
          <p className="text-sm text-neutral-700">{summary.goNoGoRationale}</p>

          {summary.missingElements.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold text-neutral-700">Elements manquants</h3>
              <ul className="list-disc pl-4 text-xs text-neutral-600">
                {summary.missingElements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {summary.pointsToClarify.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold text-neutral-700">Points a clarifier</h3>
              <ul className="list-disc pl-4 text-xs text-neutral-600">
                {summary.pointsToClarify.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-neutral-500">Aucune synthese disponible pour le moment.</p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <details className="rounded border border-neutral-100 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-neutral-700">
            Dates et echeances ({data.deadlines.total})
          </summary>
          <div className="mt-2">
            <DeadlinesList items={data.deadlines.items} />
          </div>
        </details>
        <details className="rounded border border-neutral-100 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-neutral-700">Criteres d&apos;attribution ({data.criteria.total})</summary>
          <div className="mt-2">
            <CriteriaList items={data.criteria.items} />
          </div>
        </details>
        <details className="rounded border border-neutral-100 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-neutral-700">Exigences et pieces demandees ({data.requirements.total})</summary>
          <div className="mt-2">
            <RequirementsList items={data.requirements.items} />
          </div>
        </details>
        <details className="rounded border border-neutral-100 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-neutral-700">Clauses contractuelles ({data.clauses.total})</summary>
          <div className="mt-2">
            <ClausesList items={data.clauses.items} />
          </div>
        </details>
        <details className="rounded border border-neutral-100 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-neutral-700">Risques ({data.risks.total})</summary>
          <div className="mt-2">
            <RisksList items={data.risks.items} />
          </div>
        </details>
        <details className="rounded border border-neutral-100 p-2 md:col-span-2">
          <summary className="cursor-pointer text-xs font-semibold text-neutral-700">Questions pour l&apos;acheteur ({data.questions.total})</summary>
          <div className="mt-2">
            <QuestionsList items={data.questions.items} />
          </div>
        </details>
      </div>
    </section>
  );
}
