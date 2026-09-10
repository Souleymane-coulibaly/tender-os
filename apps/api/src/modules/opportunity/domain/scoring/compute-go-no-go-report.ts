import { computeWeightedGlobalScore, LEVEL_2_CATEGORY_WEIGHTS, RECOMMENDATION_THRESHOLDS, type Level2Category } from "./category-weights";
import type { QuickScoreCompanyProfileInput, ScoreCause, ScoredCategory } from "./compute-opportunity-quick-score";
import {
  scoreCertificationsFromProfile,
  scoreFinancierMissingData,
  scorePlanningFromDeadline,
  scoreReferencesFromProfile,
  scoreRessourcesFromProfile,
} from "./shared-category-scorers";

/** Sévérité déclarée en texte libre par `RiskFindingRecord.severity` (aucun enum côté module
 *  `analysis`, valeurs typiquement produites par l'IA en français ou anglais) — bucketing tolérant,
 *  jamais un point de défaillance silencieux : toute valeur non reconnue reste `LOW` (jamais
 *  sur-évaluée), la fonction pure reste testable indépendamment de tout provider IA réel. */
export function bucketRiskSeverity(severity: string): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  const normalized = severity.trim().toUpperCase();
  if (["CRITICAL", "CRITIQUE", "BLOQUANT", "BLOCKING"].includes(normalized)) return "CRITICAL";
  if (["HIGH", "ELEVE", "ÉLEVÉ", "ELEVEE", "ÉLEVÉE", "MAJEUR", "MAJOR"].includes(normalized)) return "HIGH";
  if (["MEDIUM", "MOYEN", "MOYENNE", "MODERATE", "MODÉRÉ"].includes(normalized)) return "MEDIUM";
  return "LOW";
}

export type DocumentaryLoad = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export type PrepTimeLevel = "LOW" | "MEDIUM" | "HIGH";
export type GoNoGoRecommendation = "GO" | "GO_CONDITIONAL" | "NO_GO";

export type EstimatedPrepTime = Readonly<{
  administratif: PrepTimeLevel;
  memoireTechnique: PrepTimeLevel;
  pricing: PrepTimeLevel;
  documents: PrepTimeLevel;
  validation: PrepTimeLevel;
}>;

export type GoNoGoReportResult = Readonly<{
  globalScore: number;
  confidence: number;
  complexity: number;
  documentaryLoad: DocumentaryLoad;
  estimatedPrepTime: EstimatedPrepTime;
  categoryScores: Readonly<Record<Level2Category, ScoredCategory>>;
  positiveCauses: readonly ScoreCause[];
  negativeCauses: readonly ScoreCause[];
  risks: readonly ScoreCause[];
  blockers: readonly ScoreCause[];
  missingInfo: readonly string[];
  subcontractingFlags: readonly string[];
  recommendation: GoNoGoRecommendation;
  recommendationRationale: string;
}>;

/** Sous-ensemble minimal de `EffectiveTenderAnalysisSummary` (module `analysis`) — la couche
 *  application mappe vers cette forme, jamais le type complet transmis au domaine. */
export type AnalysisSignals = Readonly<{
  complexityLevel: string;
  mainRisksCount: number;
  mainObligationsCount: number;
  missingElementsCount: number;
  pointsToClarifyCount: number;
  goNoGoRecommendation: string;
  goNoGoRationale: string;
}>;

export type ChecklistDocumentSignals = Readonly<{
  total: number;
  required: number;
  eliminatory: number;
  eliminatoryUnprovided: number;
  requiredUnprovided: number;
}>;

export type FindingsSignals = Readonly<{
  requirementsTotal: number;
  requirementsMandatory: number;
  criteriaTotal: number;
  criteriaEliminatory: number;
  risksTotal: number;
  risksHigh: number;
  risksCritical: number;
}>;

export type AiSuggestionsSignals = Readonly<{
  accepted: number;
  modified: number;
  pending: number;
  rejected: number;
  total: number;
}>;

export type LotsSignals = Readonly<{ total: number; selectedForResponse: number }>;

export type ComputeGoNoGoReportInput = Readonly<{
  now: Date;
  submissionDeadline?: Date | undefined;
  analysis: AnalysisSignals;
  findings: FindingsSignals;
  checklistDocuments: ChecklistDocumentSignals;
  dceDocumentCount: number;
  lots: LotsSignals;
  aiSuggestions: AiSuggestionsSignals;
  companyProfile?: QuickScoreCompanyProfileInput | undefined;
  subcontractingFlags: readonly string[];
}>;

/** Complétude documentaire administrative — pièces obligatoires de la checklist prêtes ou
 *  validées (mission §21 "charge documentaire" côté administratif, distinct de la charge globale). */
function scoreAdministratif(input: ComputeGoNoGoReportInput, missingData: string[]): ScoredCategory {
  const { checklistDocuments } = input;
  if (checklistDocuments.total === 0) {
    missingData.push("Aucune pièce documentaire recensée dans la checklist de ce Tender.");
    return { score: 50, weight: LEVEL_2_CATEGORY_WEIGHTS.administratif, justification: "Aucune pièce documentaire dans la checklist — score neutre." };
  }
  const requiredProvidedRatio = checklistDocuments.required > 0 ? 1 - checklistDocuments.requiredUnprovided / checklistDocuments.required : 1;
  const score = Math.round(requiredProvidedRatio * 100);
  return {
    score,
    weight: LEVEL_2_CATEGORY_WEIGHTS.administratif,
    justification: `${checklistDocuments.required - checklistDocuments.requiredUnprovided}/${checklistDocuments.required} pièce(s) obligatoire(s) prête(s) ou validée(s).`,
  };
}

/** Compatibilité technique — exigences/critères réels du DCE (findings validés Sprint 4) plutôt que
 *  la seule déclaration libre du candidat, complétée par ses références sectorielles. */
function scoreTechnique(input: ComputeGoNoGoReportInput, missingData: string[]): ScoredCategory {
  const { findings, companyProfile } = input;
  if (findings.requirementsTotal === 0 && findings.criteriaTotal === 0) {
    missingData.push("Aucune exigence ou critère technique identifié dans l'analyse DCE.");
    return { score: 50, weight: LEVEL_2_CATEGORY_WEIGHTS.technique, justification: "Aucune exigence/critère identifié — score neutre." };
  }
  const eliminatoryRatio = findings.criteriaTotal > 0 ? findings.criteriaEliminatory / findings.criteriaTotal : 0;
  const referenceBonus = companyProfile && companyProfile.totalReferenceCount > 0 ? Math.min(20, companyProfile.matchingReferenceCount * 10) : 0;
  const base = Math.round(80 - eliminatoryRatio * 40);
  const score = Math.max(0, Math.min(100, base + referenceBonus));
  return {
    score,
    weight: LEVEL_2_CATEGORY_WEIGHTS.technique,
    justification: `${findings.requirementsTotal} exigence(s), ${findings.criteriaTotal} critère(s) dont ${findings.criteriaEliminatory} éliminatoire(s) ; ${companyProfile?.matchingReferenceCount ?? 0} référence(s) proche(s) du secteur.`,
  };
}

/** Charge documentaire (mission §21) — combine pièces de la checklist, documents DCE, lots et exigences.
 *  Jamais une simple lecture du nombre de fichiers uploadés : reflète le VOLUME réel de travail. */
function computeDocumentaryLoad(input: ComputeGoNoGoReportInput): DocumentaryLoad {
  const points =
    Math.min(4, Math.ceil(input.checklistDocuments.total / 5)) +
    Math.min(3, Math.ceil(input.dceDocumentCount / 10)) +
    Math.min(2, input.lots.total > 1 ? 2 : input.lots.total) +
    Math.min(3, Math.ceil(input.findings.requirementsTotal / 10));
  if (points <= 3) return "LOW";
  if (points <= 6) return "MEDIUM";
  if (points <= 9) return "HIGH";
  return "VERY_HIGH";
}

function prepLevelFromLoad(load: DocumentaryLoad): PrepTimeLevel {
  if (load === "LOW") return "LOW";
  if (load === "MEDIUM") return "MEDIUM";
  return "HIGH";
}

/** Temps de préparation indicatif par domaine (mission §11) — dérivé de la charge documentaire et
 *  de signaux ciblés, jamais présenté comme une garantie (toujours accompagné de `documentaryLoad`
 *  et des causes qui le justifient à l'affichage). */
function computeEstimatedPrepTime(input: ComputeGoNoGoReportInput, documentaryLoad: DocumentaryLoad): EstimatedPrepTime {
  const base = prepLevelFromLoad(documentaryLoad);
  const memoireTechnique: PrepTimeLevel = input.findings.criteriaTotal > 5 || input.findings.requirementsTotal > 15 ? "HIGH" : base;
  const pricing: PrepTimeLevel = input.lots.total > 3 ? "HIGH" : input.lots.total > 1 ? "MEDIUM" : "LOW";
  const validation: PrepTimeLevel = input.checklistDocuments.eliminatoryUnprovided > 0 ? "HIGH" : base;
  return { administratif: base, memoireTechnique, pricing, documents: base, validation };
}

/** Complexité 1-5 (mission §9) — distincte du score de compatibilité, informée par le niveau de
 *  complexité déjà qualifié par l'analyse IA du DCE (Sprint 4) ET par des signaux structurels
 *  indépendants (lots, pièces éliminatoires), jamais une simple recopie du signal Sprint 4 seul. */
function computeComplexity(input: ComputeGoNoGoReportInput): number {
  const analysisLevel = input.analysis.complexityLevel.trim().toUpperCase();
  let complexity = analysisLevel === "HIGH" || analysisLevel === "ELEVE" || analysisLevel === "ÉLEVÉ" ? 3 : analysisLevel === "LOW" || analysisLevel === "FAIBLE" ? 1 : 2;
  if (input.lots.total > 3) complexity += 1;
  if (input.checklistDocuments.eliminatory > 2) complexity += 1;
  return Math.max(1, Math.min(5, complexity));
}

function computeConfidence(missingDataCount: number, aiSuggestions: AiSuggestionsSignals): number {
  const pendingRatio = aiSuggestions.total > 0 ? aiSuggestions.pending / aiSuggestions.total : 0;
  const penalty = Math.min(0.7, missingDataCount * 0.1 + pendingRatio * 0.2);
  return Math.round((1 - penalty) * 100) / 100;
}

function recommendationFromScore(globalScore: number): GoNoGoRecommendation {
  if (globalScore >= RECOMMENDATION_THRESHOLDS.go) return "GO";
  if (globalScore >= RECOMMENDATION_THRESHOLDS.goConditional) return "GO_CONDITIONAL";
  return "NO_GO";
}

export function computeGoNoGoReport(input: ComputeGoNoGoReportInput): GoNoGoReportResult {
  const missingData: string[] = [];

  const administratif = scoreAdministratif(input, missingData);
  const technique = scoreTechnique(input, missingData);
  const financier = scoreFinancierMissingData(LEVEL_2_CATEGORY_WEIGHTS.financier, missingData);
  const planning = scorePlanningFromDeadline(input.submissionDeadline, input.now, LEVEL_2_CATEGORY_WEIGHTS.planning, missingData);
  const ressources = scoreRessourcesFromProfile(input.companyProfile, LEVEL_2_CATEGORY_WEIGHTS.ressources, missingData);
  const references = scoreReferencesFromProfile(input.companyProfile, LEVEL_2_CATEGORY_WEIGHTS.references, missingData);
  const certifications = scoreCertificationsFromProfile(input.companyProfile, LEVEL_2_CATEGORY_WEIGHTS.certifications, missingData);

  if (input.aiSuggestions.pending > 0) {
    missingData.push(`${input.aiSuggestions.pending} suggestion(s) IA en attente de validation humaine — non utilisée(s) comme vérité métier.`);
  }
  if (input.analysis.missingElementsCount > 0) {
    missingData.push(`${input.analysis.missingElementsCount} élément(s) manquant(s) signalé(s) par l'analyse IA du DCE.`);
  }

  const categoryScores: Record<Level2Category, ScoredCategory> = {
    administratif,
    technique,
    financier,
    planning,
    ressources,
    references,
    certifications,
  };

  const globalScore = computeWeightedGlobalScore(new Map(Object.entries(categoryScores)));
  const documentaryLoad = computeDocumentaryLoad(input);
  const estimatedPrepTime = computeEstimatedPrepTime(input, documentaryLoad);
  const complexity = computeComplexity(input);
  const confidence = computeConfidence(missingData.length, input.aiSuggestions);

  const positiveCauses: ScoreCause[] = [];
  const negativeCauses: ScoreCause[] = [];
  for (const [category, entry] of Object.entries(categoryScores) as [Level2Category, ScoredCategory][]) {
    const cause: ScoreCause = { category, description: entry.justification, weight: entry.weight, source: "go_no_go_report", justification: entry.justification };
    if (entry.score >= 70) positiveCauses.push(cause);
    else if (entry.score <= 30) negativeCauses.push(cause);
  }

  const risks: ScoreCause[] = [];
  if (input.findings.risksCritical > 0) {
    risks.push({
      category: "risque",
      description: `${input.findings.risksCritical} risque(s) critique(s) identifié(s) par l'analyse IA du DCE.`,
      weight: 0,
      source: "risk_finding",
      justification: "Sévérité critique déclarée par au moins un constat de risque validé.",
    });
  } else if (input.findings.risksHigh > 0) {
    risks.push({
      category: "risque",
      description: `${input.findings.risksHigh} risque(s) élevé(s) identifié(s) par l'analyse IA du DCE.`,
      weight: 0,
      source: "risk_finding",
      justification: "Sévérité élevée déclarée par au moins un constat de risque validé.",
    });
  }
  if (input.analysis.mainRisksCount > 0) {
    risks.push({
      category: "risque",
      description: `${input.analysis.mainRisksCount} risque(s) principal/principaux signalé(s) par la synthèse IA du DCE.`,
      weight: 0,
      source: "analysis_summary",
      justification: input.analysis.goNoGoRationale,
    });
  }

  const blockers: ScoreCause[] = [];
  if (input.submissionDeadline && input.submissionDeadline.getTime() < input.now.getTime()) {
    blockers.push({
      category: "planning",
      description: "La date limite de dépôt est déjà passée.",
      weight: LEVEL_2_CATEGORY_WEIGHTS.planning,
      source: "go_no_go_report",
      justification: `Date limite : ${input.submissionDeadline.toISOString()}.`,
    });
  }
  if (input.checklistDocuments.eliminatoryUnprovided > 0) {
    blockers.push({
      category: "administratif",
      description: `${input.checklistDocuments.eliminatoryUnprovided} pièce(s) bloquante(s) de la checklist sans document prêt ni validation.`,
      weight: LEVEL_2_CATEGORY_WEIGHTS.administratif,
      source: "checklist_item",
      justification: "Une pièce marquée bloquante dans la checklist reste absente ou non validée — signal factuel, ne bloque jamais automatiquement la décision humaine.",
    });
  }

  const recommendation = recommendationFromScore(globalScore);
  const recommendationRationale = `Score global pondéré ${globalScore}/100 (seuils : GO ≥ ${RECOMMENDATION_THRESHOLDS.go}, GO_CONDITIONAL ≥ ${RECOMMENDATION_THRESHOLDS.goConditional}). ${blockers.length > 0 ? `${blockers.length} blocage(s) détecté(s), affiché(s) séparément — n'altère jamais automatiquement cette recommandation.` : "Aucun blocage éliminatoire détecté."}`;

  return {
    globalScore,
    confidence,
    complexity,
    documentaryLoad,
    estimatedPrepTime,
    categoryScores,
    positiveCauses,
    negativeCauses,
    risks,
    blockers,
    missingInfo: missingData,
    subcontractingFlags: input.subcontractingFlags,
    recommendation,
    recommendationRationale,
  };
}
