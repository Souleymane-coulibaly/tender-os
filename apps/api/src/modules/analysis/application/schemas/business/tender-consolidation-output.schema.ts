import { z } from "zod";
import { AiSchemaValidationFailedError } from "../../../domain/errors";
import { ComplexityLevel } from "../../../domain/business/complexity-level";
import { GoNoGoRecommendation } from "../../../domain/business/go-no-go-recommendation";
import { QuestionPriority } from "../../../domain/business/question-priority";
import { RiskSeverity } from "../../../domain/business/risk-severity";
import {
  BusinessMetadataSchema,
  TenderClauseItemSchema,
  TenderCriterionItemSchema,
  TenderDeadlineItemSchema,
  TenderRequirementItemSchema,
} from "./business-analysis-items.schema";
import { TenderProvenanceSchema } from "./provenance.schema";

const RISK_SEVERITIES = Object.values(RiskSeverity) as [string, ...string[]];
const QUESTION_PRIORITIES = Object.values(QuestionPriority) as [string, ...string[]];
const COMPLEXITY_LEVELS = Object.values(ComplexityLevel) as [string, ...string[]];
const GO_NO_GO_RECOMMENDATIONS = Object.values(GoNoGoRecommendation) as [string, ...string[]];

// Mission §6 "Risques" — chaque risque doit contenir titre/catégorie/gravité/probabilité si
// possible/explication/recommandation/source/score de confiance.
export const TenderRiskItemSchema = z
  .object({
    title: z.string().min(1).max(300),
    category: z.string().min(1).max(60),
    severity: z.enum(RISK_SEVERITIES),
    probability: z.number().min(0).max(1).optional().nullable(),
    explanation: z.string().min(1).max(2000),
    recommendation: z.string().min(1).max(1000),
  })
  .merge(TenderProvenanceSchema);
export type TenderRiskItemOutput = z.infer<typeof TenderRiskItemSchema>;

// Mission §7 "Questions à poser à l'acheteur".
export const TenderQuestionItemSchema = z
  .object({
    question: z.string().min(1).max(1000),
    justification: z.string().min(1).max(1000),
    priority: z.enum(QUESTION_PRIORITIES),
    theme: z.string().min(1).max(120),
  })
  .merge(TenderProvenanceSchema);
export type TenderQuestionItemOutput = z.infer<typeof TenderQuestionItemSchema>;

// Mission §"TenderAnalysisConflict" — contradictions entre documents, repliées dans la synthèse
// (voir migration/schema.prisma pour la justification de ce choix de structure).
export const TenderAnalysisConflictSchema = z.object({
  category: z.string().min(1).max(120),
  description: z.string().min(1).max(1000),
  documentIds: z.array(z.string().uuid()).max(20).default([]),
});
export type TenderAnalysisConflictOutput = z.infer<typeof TenderAnalysisConflictSchema>;

// Mission §8 "Synthèse métier structurée".
export const TenderAnalysisSummaryOutputSchema = z.object({
  opportunitySummary: z.string().min(1).max(2000),
  complexityLevel: z.enum(COMPLEXITY_LEVELS),
  mainCriteria: z.array(z.string().max(300)).max(20),
  mainRisks: z.array(z.string().max(300)).max(20),
  mainObligations: z.array(z.string().max(300)).max(20),
  missingElements: z.array(z.string().max(300)).max(20),
  pointsToClarify: z.array(z.string().max(300)).max(20),
  conflicts: z.array(TenderAnalysisConflictSchema).max(20).default([]),
  // IMPORTANT (mission) : une aide à la décision, jamais une décision automatique définitive.
  goNoGoRecommendation: z.enum(GO_NO_GO_RECOMMENDATIONS),
  goNoGoRationale: z.string().min(1).max(2000),
});
export type TenderAnalysisSummaryOutput = z.infer<typeof TenderAnalysisSummaryOutputSchema>;

/**
 * Sortie structurée de la consolidation Tender (mission Sprint 4.2, étape 2 "Consolidation
 * Tender") — fusionne les analyses documentaires (doublons, contradictions, priorités entre
 * documents) ET détecte les risques ET génère les questions ET produit la synthèse, en UN seul
 * appel structuré (voir rapport §D pour la justification de ce regroupement plutôt que 3 appels
 * séparés DETECT_RISKS/GENERATE_QUESTIONS/CONSOLIDATE_TENDER_ANALYSIS).
 */
export const TenderConsolidationOutputSchema = z.object({
  metadata: BusinessMetadataSchema,
  deadlines: z.array(TenderDeadlineItemSchema).max(100),
  criteria: z.array(TenderCriterionItemSchema).max(100),
  requirements: z.array(TenderRequirementItemSchema).max(200),
  clauses: z.array(TenderClauseItemSchema).max(200),
  risks: z.array(TenderRiskItemSchema).max(100),
  questions: z.array(TenderQuestionItemSchema).max(100),
  summary: TenderAnalysisSummaryOutputSchema,
});

export type TenderConsolidationOutput = z.infer<typeof TenderConsolidationOutputSchema>;

export function parseTenderConsolidationOutput(rawContent: string): TenderConsolidationOutput {
  let json: unknown;
  try {
    json = JSON.parse(rawContent);
  } catch {
    throw new AiSchemaValidationFailedError({ reason: "tender consolidation response is not valid JSON" });
  }

  const result = TenderConsolidationOutputSchema.safeParse(json);
  if (!result.success) {
    throw new AiSchemaValidationFailedError({
      reason: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    });
  }
  return result.data;
}
