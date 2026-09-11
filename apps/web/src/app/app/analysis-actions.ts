"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type {
  AnalysisCapability,
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
import { apiErrorMessage } from "../../lib/api-error-messages";

export type FormActionState = { error?: string };

/** Mission Sprint 8A.2 (correction bug #10 "erreurs techniques affichées brutes") — même motif
 *  que `describeExportActionError` (export-actions.ts) : ne laisse jamais `error.message` (texte
 *  backend brut, souvent en anglais) atteindre un composant. */
function describeAnalysisActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Analysis action failed (${error.status} ${error.code}): ${error.message}`);
    const known = apiErrorMessage(error);
    if (known) return known;
    switch (error.status) {
      case 400:
        return "Certains champs sont invalides.";
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action.";
      case 404:
        return "Ressource introuvable.";
      case 409:
        return "Cette action entre en conflit avec l'état actuel de la ressource.";
      case 422:
        return "Certains champs sont invalides.";
      case 429:
        return "Trop de requêtes envoyées au fournisseur IA. Veuillez réessayer dans quelques instants.";
      case 503:
        return "Le service d'intelligence artificielle est momentanément indisponible. Veuillez réessayer plus tard.";
      case 504:
        return "Le fournisseur IA n'a pas répondu à temps. Veuillez réessayer.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during an analysis action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
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

/** Mission — vérifie côté backend, avant d'afficher le bouton "Analyser", si l'analyse IA est
 *  réellement configurée (jamais une tentative à l'aveugle suivie d'un échec asynchrone opaque). */
export async function fetchAnalysisCapabilities(tenderId: string): Promise<AnalysisCapability[]> {
  const result = await appApiFetch<{ items: AnalysisCapability[] }>(`/api/v1/tenders/${tenderId}/analysis-capabilities`);
  return result.items;
}

export async function startTenderAnalysisAction(tenderId: string): Promise<FormActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/analyses`, { method: "POST" });
  } catch (error) {
    return { error: describeAnalysisActionError(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function retryAnalysisAction(tenderId: string, analysisId: string): Promise<FormActionState> {
  try {
    await appApiFetch(`/api/v1/analyses/${analysisId}/retry`, { method: "POST" });
  } catch (error) {
    return { error: describeAnalysisActionError(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export type DocumentAnalysisActionState = { error?: string; job?: AnalysisJobSummary };

/** Mission Sprint 8A.2 — déclenchement d'une analyse pour UN document (bouton "Analyser" de la
 *  section DCE), distinct de `startTenderAnalysisAction` (consolidation). Le bouton appelant reste
 *  désactivé tant que `processingStatus` n'indique pas une extraction terminée (voir
 *  `isReadyForAnalysis`, dce-types.ts) — revalidé de toute façon côté API
 *  (ExtractionNotReadyForAnalysisError), jamais une autorité réelle côté frontend. */
export async function startDocumentAnalysisAction(tenderId: string, documentId: string): Promise<DocumentAnalysisActionState> {
  try {
    const job = await appApiFetch<AnalysisJobSummary>(`/api/v1/tenders/${tenderId}/documents/${documentId}/analyses`, {
      method: "POST",
    });
    return { job };
  } catch (error) {
    return { error: describeAnalysisActionError(error) };
  }
}

export async function retryDocumentAnalysisAction(analysisId: string): Promise<DocumentAnalysisActionState> {
  try {
    const job = await appApiFetch<AnalysisJobSummary>(`/api/v1/analyses/${analysisId}/retry`, { method: "POST" });
    return { job };
  } catch (error) {
    return { error: describeAnalysisActionError(error) };
  }
}

export async function getAnalysisJobAction(analysisId: string): Promise<DocumentAnalysisActionState> {
  try {
    const job = await appApiFetch<AnalysisJobSummary>(`/api/v1/analyses/${analysisId}`);
    return { job };
  } catch (error) {
    return { error: describeAnalysisActionError(error) };
  }
}
