import { z } from "zod";
import { AiSuggestionEntityType, type AiSuggestionFieldSchemaRegistry } from "../../ai-suggestion";
import { CREATE_FIELD_SENTINEL } from "../application/ports/entity-target-adapter";

const isoDateTimeString = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Date invalide." });

const uuid = z.string().uuid();

const TENDER_FIELD_DATE_FIELDS = ["publicationDate", "submissionDeadline", "questionsDeadline", "visitDate", "estimatedStartDate"] as const;

// Doit rester synchronisé avec `tenders/domain/milestone.entity.ts` (MilestoneType) — analysis ne
// dépend jamais du domaine Tenders (Clean Architecture), ce module (le seul à connaître les deux
// mondes) porte donc seul cette coïncidence de valeurs, même motif que les `ALLOWED_FIELDS` des
// adaptateurs.
const MILESTONE_TYPES = ["SUBMISSION_DEADLINE", "QUESTION_DEADLINE", "MANDATORY_VISIT", "INTERNAL_VALIDATION", "CUSTOM"] as const;
const RISK_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const RISK_CATEGORIES = ["ADMINISTRATIVE", "LEGAL", "TECHNICAL", "FINANCIAL", "PLANNING", "RESOURCE", "SECURITY", "OTHER"] as const;

const CreateMilestoneProposalSchema = z
  .object({
    title: z.string().min(1).max(300),
    description: z.string().max(2000).optional(),
    date: isoDateTimeString,
    type: z.enum(MILESTONE_TYPES),
    lotId: uuid.optional(),
    mandatory: z.boolean().optional(),
  })
  .strict();

const CreateAwardCriterionProposalSchema = z
  .object({
    name: z.string().min(1).max(300),
    weight: z.string().min(1).max(20),
    scoringMethod: z.string().max(500).optional(),
    eliminationThreshold: z.string().max(300).optional(),
    lotId: uuid.optional(),
  })
  .strict();

const CreateRequestedDocumentProposalSchema = z
  .object({
    name: z.string().min(1).max(300),
    category: z.string().max(60).optional(),
    required: z.boolean().optional(),
    description: z.string().max(2000).optional(),
    lotId: uuid.optional(),
  })
  .strict();

const CreateRiskProposalSchema = z
  .object({
    title: z.string().min(1).max(300),
    severity: z.enum(RISK_SEVERITIES),
    description: z.string().max(2000).optional(),
    mitigation: z.string().max(1000).optional(),
    category: z.enum(RISK_CATEGORIES).optional(),
    lotId: uuid.optional(),
  })
  .strict();

/**
 * V2 Sprint 4 §9-12 — schémas de validation pour le SEUL producteur existant de suggestions
 * (`analysis`, mapping Finding → AiSuggestion, voir `MapAnalysisFindingsToAiSuggestionsUseCase`).
 * Enregistrés ici (et non dans `analysis`) parce que ce module est le seul à connaître à la fois
 * le catalogue générique `AiSuggestionEntityType` et la forme réelle des commandes Tenders —
 * `analysis` ne dépend ainsi jamais du domaine Tenders, seulement de valeurs de champ opaques.
 */
export function registerFindingMappingSchemas(registry: AiSuggestionFieldSchemaRegistry): void {
  for (const fieldName of TENDER_FIELD_DATE_FIELDS) {
    registry.register(AiSuggestionEntityType.TenderField, fieldName, isoDateTimeString);
  }
  registry.register(AiSuggestionEntityType.TenderMilestone, CREATE_FIELD_SENTINEL, CreateMilestoneProposalSchema);
  registry.register(AiSuggestionEntityType.TenderAwardCriterion, CREATE_FIELD_SENTINEL, CreateAwardCriterionProposalSchema);
  registry.register(AiSuggestionEntityType.TenderRequestedDocument, CREATE_FIELD_SENTINEL, CreateRequestedDocumentProposalSchema);
  registry.register(AiSuggestionEntityType.TenderRisk, CREATE_FIELD_SENTINEL, CreateRiskProposalSchema);
}
