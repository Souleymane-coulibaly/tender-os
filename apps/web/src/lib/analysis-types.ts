/** Types cote frontend pour le module Analysis (Sprint 4.1 declenchement/statut, Sprint 4.2
 *  resultat metier consolide) — memes formes que les DTO/records exposes par l'API, jamais une
 *  redefinition divergente (voir apps/api/src/modules/analysis/application/dtos.ts et
 *  application/ports/business-analysis.repository.ts). */

export type AnalysisScope = "DOCUMENT" | "TENDER";

export type AnalysisStatus = "PENDING" | "QUEUED" | "PROCESSING" | "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED" | "CANCELLED";

export type AnalysisJobSummary = {
  id: string;
  organizationId: string;
  tenderId: string;
  dceId?: string;
  documentId?: string;
  scope: AnalysisScope;
  status: AnalysisStatus;
  provider?: string;
  model?: string;
  analysisVersion: number;
  promptVersion: number;
  extractionVersion?: number;
  attemptCount: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  inputTokenCount?: number;
  outputTokenCount?: number;
  totalTokenCount?: number;
  resultSummary?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type ListTenderAnalysesResult = { items: AnalysisJobSummary[]; total: number; limit: number; offset: number };

export type GoNoGoRecommendation = "GO" | "GO_WITH_RESERVATIONS" | "NO_GO" | "INSUFFICIENT_DATA";
export type ComplexityLevel = "LOW" | "MEDIUM" | "HIGH";

export type TenderAnalysisConflict = { category: string; description: string; documentIds: string[] };

export type TenderAnalysisSummary = {
  analysisVersion: number;
  opportunitySummary: string;
  complexityLevel: ComplexityLevel;
  mainCriteria: string[];
  mainRisks: string[];
  mainObligations: string[];
  missingElements: string[];
  pointsToClarify: string[];
  conflicts: TenderAnalysisConflict[];
  goNoGoRecommendation: GoNoGoRecommendation;
  goNoGoRationale: string;
  createdAt: string;
};

/** Champs de provenance communs a toutes les findings (mission §"Provenance obligatoire") — au
 *  moins une citation/page/section OU `isInferred: true` si le fait a ete deduit plutot que lu. */
export type FindingProvenance = {
  documentId?: string;
  chunkSequence?: number;
  pageStart?: number;
  pageEnd?: number;
  sheetName?: string;
  sectionTitle?: string;
  citation?: string;
  isInferred: boolean;
  confidence: number;
};

export type DeadlineFinding = FindingProvenance & {
  id: string;
  kind: string;
  label: string;
  date?: string;
  rawText?: string;
  createdAt: string;
};

export type CriterionFinding = FindingProvenance & {
  id: string;
  name: string;
  weight?: number;
  subCriteria?: { name: string; weight?: number }[];
  scoringMethod?: string;
  priceFormula?: string;
  threshold?: string;
  isEliminatory: boolean;
  createdAt: string;
};

export type ClauseFinding = FindingProvenance & {
  id: string;
  category: string;
  summary: string;
  createdAt: string;
};

export type RequirementFinding = FindingProvenance & {
  id: string;
  category: string;
  label: string;
  expectedFormat?: string;
  isMandatory: boolean;
  createdAt: string;
};

export type RiskFinding = FindingProvenance & {
  id: string;
  title: string;
  category: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  probability?: number;
  explanation: string;
  recommendation: string;
  createdAt: string;
};

export type QuestionFinding = FindingProvenance & {
  id: string;
  question: string;
  justification: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  theme: string;
  createdAt: string;
};

export type FindingsPage<T> = { items: T[]; total: number; limit: number; offset: number; analysisVersion?: number };

export type AnalysisSectionData = {
  latestJob: AnalysisJobSummary | null;
  jobHistoryCount: number;
  summary: TenderAnalysisSummary | null;
  deadlines: FindingsPage<DeadlineFinding>;
  criteria: FindingsPage<CriterionFinding>;
  requirements: FindingsPage<RequirementFinding>;
  clauses: FindingsPage<ClauseFinding>;
  risks: FindingsPage<RiskFinding>;
  questions: FindingsPage<QuestionFinding>;
};

export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = {
  PENDING: "En attente",
  QUEUED: "En file d'attente",
  PROCESSING: "En cours",
  SUCCEEDED: "Terminee",
  PARTIALLY_SUCCEEDED: "Terminee (partielle)",
  FAILED: "Echouee",
  CANCELLED: "Annulee",
};

export const GO_NO_GO_LABELS: Record<GoNoGoRecommendation, string> = {
  GO: "Favorable",
  GO_WITH_RESERVATIONS: "Favorable avec reserves",
  NO_GO: "Defavorable",
  INSUFFICIENT_DATA: "Donnees insuffisantes",
};

export const COMPLEXITY_LABELS: Record<ComplexityLevel, string> = { LOW: "Faible", MEDIUM: "Moyenne", HIGH: "Elevee" };

/** Meme permission backend que analysis:trigger (ROLE_ANALYSIS_PERMISSIONS — OWNER,
 *  ORGANIZATION_ADMIN, BID_MANAGER, CONTRIBUTOR) — gate d'affichage uniquement, jamais l'autorite
 *  reelle (revalidee par l'API a chaque requete quoi que montre l'UI). */
const ROLES_ALLOWED_TO_TRIGGER_ANALYSIS = ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER", "CONTRIBUTOR"];

export function canTriggerAnalysis(role: string | undefined): boolean {
  return role !== undefined && ROLES_ALLOWED_TO_TRIGGER_ANALYSIS.includes(role);
}
