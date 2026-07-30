import type { AnalysisJobSummary } from "../../application/dtos";

// Passe-plat volontaire : AnalysisJobSummary n'expose déjà jamais le contenu du corpus analysé ni
// la réponse brute du provider (même règle que Extraction/DCE/Documents, conception §M).
export function presentAnalysisJob(job: AnalysisJobSummary): AnalysisJobSummary {
  return { ...job };
}
