"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type {
  AnalysisJobSummary,
  AnalysisSectionData,
  ClauseFinding,
  CriterionFinding,
  DeadlineFinding,
  FindingsPage,
  ListTenderAnalysesResult,
  QuestionFinding,
  RequirementFinding,
  RiskFinding,
  TenderAnalysisSummary,
} from "../../lib/analysis-types";

export type FormActionState = { error?: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Une erreur est survenue.";
}

/** GET .../analysis renvoie 404 TENDER_BUSINESS_ANALYSIS_NOT_FOUND tant qu'aucune consolidation
 *  n'a encore reussi — jamais une erreur de page, seulement l'etat "pas encore de synthese". */
async function fetchLatestSummary(tenderId: string): Promise<TenderAnalysisSummary | null> {
  try {
    return await appApiFetch<TenderAnalysisSummary>(`/api/v1/tenders/${tenderId}/analysis`);
  } catch (error) {
    if (error instanceof AppApiError && error.status === 404) return null;
    throw error;
  }
}

/** Combine toutes les lectures necessaires a la section Analyse d'une fiche Tender (mission
 *  Sprint 4.2 §"Consulter toutes les categories") en un seul appel — utilisee a la fois par le
 *  rendu serveur initial de la page Tender et par le bouton "Actualiser" (rappelee directement
 *  depuis le composant client, meme motif que fetchDceSectionData). */
export async function fetchAnalysisSectionData(tenderId: string): Promise<AnalysisSectionData> {
  const [history, summary, deadlines, criteria, requirements, clauses, risks, questions] = await Promise.all([
    appApiFetch<ListTenderAnalysesResult>(`/api/v1/tenders/${tenderId}/analyses?limit=1`),
    fetchLatestSummary(tenderId),
    appApiFetch<FindingsPage<DeadlineFinding>>(`/api/v1/tenders/${tenderId}/analysis/deadlines?limit=50`),
    appApiFetch<FindingsPage<CriterionFinding>>(`/api/v1/tenders/${tenderId}/analysis/criteria?limit=50`),
    appApiFetch<FindingsPage<RequirementFinding>>(`/api/v1/tenders/${tenderId}/analysis/requirements?limit=100`),
    appApiFetch<FindingsPage<ClauseFinding>>(`/api/v1/tenders/${tenderId}/analysis/clauses?limit=100`),
    appApiFetch<FindingsPage<RiskFinding>>(`/api/v1/tenders/${tenderId}/analysis/risks?limit=100`),
    appApiFetch<FindingsPage<QuestionFinding>>(`/api/v1/tenders/${tenderId}/analysis/questions?limit=100`),
  ]);

  const latestJob: AnalysisJobSummary | null = history.items[0] ?? null;

  return { latestJob, jobHistoryCount: history.total, summary, deadlines, criteria, requirements, clauses, risks, questions };
}

export async function startTenderAnalysisAction(tenderId: string): Promise<FormActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/analyses`, { method: "POST" });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function retryAnalysisAction(tenderId: string, analysisId: string): Promise<FormActionState> {
  try {
    await appApiFetch(`/api/v1/analyses/${analysisId}/retry`, { method: "POST" });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}
