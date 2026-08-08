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

// V2 Sprint 6 §5-8 — doit rester synchronisé avec `tenders/domain/checklist-item.entity.ts`
// (ChecklistItemType/ChecklistRequirementLevel/ChecklistItemCriticality/ChecklistSubjectType),
// même motif que MILESTONE_TYPES ci-dessus.
const CHECKLIST_ITEM_TYPES = [
  "ADMINISTRATIVE_DOCUMENT",
  "TECHNICAL_DOCUMENT",
  "FINANCIAL_DOCUMENT",
  "CERTIFICATION",
  "INSURANCE",
  "DECLARATION",
  "FORM",
  "SIGNATURE",
  "VISIT",
  "REFERENCE",
  "TECHNICAL_REQUIREMENT",
  "FINANCIAL_REQUIREMENT",
  "DEADLINE",
  "DELIVERABLE",
  "OTHER",
] as const;
const CHECKLIST_REQUIREMENT_LEVELS = ["MANDATORY", "CONDITIONAL", "INFORMATIONAL"] as const;
const CHECKLIST_ITEM_CRITICALITIES = ["BLOCKING", "HIGH", "MEDIUM", "LOW"] as const;
const CHECKLIST_SUBJECT_TYPES = ["CANDIDATE", "GROUP_MEMBER", "SUBCONTRACTOR", "ANY_MEMBER", "TENDER", "LOT"] as const;

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

/** V2 Sprint 6 §9-10 — proposition de création CHECKLIST_ITEM (Requirement redirigé, Criterion
 *  éliminatoire, Deadline VISIT — voir `finding-to-suggestion-mapper.ts`). `requirementLevel`
 *  volontairement optionnel malgré une valeur toujours fournie côté mapper : reste utilisable par
 *  une future source de suggestion qui laisserait le domaine appliquer son défaut MANDATORY. */
const CreateChecklistItemProposalSchema = z
  .object({
    title: z.string().min(1).max(300),
    type: z.enum(CHECKLIST_ITEM_TYPES).optional(),
    requirementLevel: z.enum(CHECKLIST_REQUIREMENT_LEVELS).optional(),
    conditionText: z.string().max(2000).optional(),
    criticality: z.enum(CHECKLIST_ITEM_CRITICALITIES).optional(),
    description: z.string().max(2000).optional(),
    lotId: uuid.optional(),
    subjectType: z.enum(CHECKLIST_SUBJECT_TYPES).optional(),
    dueDate: isoDateTimeString.optional(),
    // V2 Sprint 6 §22 — hint UI PUREMENT INFORMATIF posé par `ReconcileChecklistWithNewAnalysisUseCase`
    // ("cette proposition de création vient d'une réconciliation, pas de la génération initiale"),
    // jamais une colonne persistée sur ChecklistItem lui-même.
    changeKind: z.enum(["NEW_REQUIREMENT"]).optional(),
  })
  .strict();
// V2 Sprint 6 §22 — schéma d'UPDATE (jamais de création) pour la réconciliation d'un item déjà
// existant : même motif que TENDER_FIELD_DATE_FIELDS ci-dessus, un scalaire brut (jamais un objet
// enveloppe), la présence d'un `entityId` renseigné suffit déjà à distinguer ce cas d'une création.
const UpdateChecklistItemTitleSchema = z.string().min(1).max(300);

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
  registry.register(AiSuggestionEntityType.ChecklistItem, CREATE_FIELD_SENTINEL, CreateChecklistItemProposalSchema);
  registry.register(AiSuggestionEntityType.ChecklistItem, "title", UpdateChecklistItemTitleSchema);
}
