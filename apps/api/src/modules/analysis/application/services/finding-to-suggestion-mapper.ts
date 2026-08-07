import { AiSuggestionEntityType } from "../../../ai-suggestion";
import { CREATE_FIELD_SENTINEL } from "../../../ai-suggestion-bridge";
import { DeadlineKind } from "../../domain/business/deadline-kind";
import type { CriterionFindingRecord, DeadlineFindingRecord, RequirementFindingRecord, RiskFindingRecord } from "../ports/business-analysis.repository";

export type MappedSuggestion = Readonly<{
  entityType: string;
  entityId?: string | undefined;
  fieldName: string;
  proposedValue: unknown;
  confidence: number;
  sourceDocumentId?: string | undefined;
  /** Audit Codex P1-004 (round 3) — lue DIRECTEMENT sur le Finding (`documentVersionId`, gravée au
   *  moment de `persistTenderConsolidation`, jamais recalculée) : ce mapper reste une fonction
   *  pure, sans aucun accès I/O au module Documents. */
  sourceDocumentVersionId?: string | undefined;
  sourcePage?: number | undefined;
  sourceChunkReference?: string | undefined;
}>;

const RISK_CATEGORIES = new Set(["ADMINISTRATIVE", "LEGAL", "TECHNICAL", "FINANCIAL", "PLANNING", "RESOURCE", "SECURITY", "OTHER"]);

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function provenanceOf(finding: {
  documentId?: string | null | undefined;
  documentVersionId?: string | null | undefined;
  pageStart?: number | null | undefined;
  citation?: string | null | undefined;
  sectionTitle?: string | null | undefined;
}): Pick<MappedSuggestion, "sourceDocumentId" | "sourceDocumentVersionId" | "sourcePage" | "sourceChunkReference"> {
  return {
    sourceDocumentId: finding.documentId ?? undefined,
    sourceDocumentVersionId: finding.documentVersionId ?? undefined,
    sourcePage: finding.pageStart ?? undefined,
    sourceChunkReference: finding.citation ?? finding.sectionTitle ?? undefined,
  };
}

/**
 * V2 Sprint 4 §9 — DeadlineFinding → TENDER_FIELD (échéances correspondant à un champ Tender
 * générique) ou TENDER_MILESTONE (les autres natures d'échéance). `null` si le finding ne porte
 * qu'un `rawText` sans date normalisée exploitable — jamais une suggestion avec une date devinée
 * (mission "aucune hallucination").
 */
export function mapDeadlineFinding(finding: DeadlineFindingRecord): MappedSuggestion | null {
  if (!finding.date) {
    return null;
  }

  const base = { confidence: clampConfidence(finding.confidence), ...provenanceOf(finding) };

  switch (finding.kind) {
    case DeadlineKind.Submission:
      return { ...base, entityType: AiSuggestionEntityType.TenderField, fieldName: "submissionDeadline", proposedValue: finding.date };
    case DeadlineKind.Questions:
      return { ...base, entityType: AiSuggestionEntityType.TenderField, fieldName: "questionsDeadline", proposedValue: finding.date };
    case DeadlineKind.Visit:
      return { ...base, entityType: AiSuggestionEntityType.TenderField, fieldName: "visitDate", proposedValue: finding.date };
    case DeadlineKind.Publication:
      return { ...base, entityType: AiSuggestionEntityType.TenderField, fieldName: "publicationDate", proposedValue: finding.date };
    case DeadlineKind.StartEstimated:
      return { ...base, entityType: AiSuggestionEntityType.TenderField, fieldName: "estimatedStartDate", proposedValue: finding.date };
    default:
      // ANSWER / VALIDITY_PERIOD / INTERMEDIATE / CONTRACTUAL / OTHER — aucun champ Tender
      // générique ne convient, mission §9 : devient un jalon (type CUSTOM, seule valeur du
      // catalogue MilestoneType qui ne présuppose pas une nature déjà connue).
      return {
        ...base,
        entityType: AiSuggestionEntityType.TenderMilestone,
        fieldName: CREATE_FIELD_SENTINEL,
        proposedValue: {
          title: finding.label,
          date: finding.date,
          type: "CUSTOM",
          ...(finding.rawText ? { description: finding.rawText } : {}),
        },
      };
  }
}

/**
 * V2 Sprint 4 §9 — CriterionFinding → TENDER_AWARD_CRITERION (toujours une proposition de
 * création). `null` si aucune pondération n'a été extraite : `weight` est requis par
 * `CreateAwardCriterionUseCase`, jamais une valeur fabriquée à sa place.
 */
export function mapCriterionFinding(finding: CriterionFindingRecord): MappedSuggestion | null {
  if (finding.weight === undefined || finding.weight === null) {
    return null;
  }

  return {
    entityType: AiSuggestionEntityType.TenderAwardCriterion,
    fieldName: CREATE_FIELD_SENTINEL,
    proposedValue: {
      name: finding.name,
      weight: String(finding.weight),
      ...(finding.scoringMethod ? { scoringMethod: finding.scoringMethod } : {}),
      ...(finding.isEliminatory && finding.threshold ? { eliminationThreshold: finding.threshold } : {}),
    },
    confidence: clampConfidence(finding.confidence),
    ...provenanceOf(finding),
  };
}

/** V2 Sprint 4 §10 — RequirementFinding → TENDER_REQUESTED_DOCUMENT (toujours une proposition de
 *  création, mission "RequirementFinding → TENDER_REQUESTED_DOCUMENT ou champs Tender/Lot
 *  autorisés" : le sous-ensemble Tender/Lot n'est pas exploité ce sprint, aucune exigence
 *  consolidée ne correspond de façon fiable à un champ Tender/Lot scalaire existant). */
export function mapRequirementFinding(finding: RequirementFindingRecord): MappedSuggestion {
  return {
    entityType: AiSuggestionEntityType.TenderRequestedDocument,
    fieldName: CREATE_FIELD_SENTINEL,
    proposedValue: {
      name: finding.label,
      category: finding.category,
      required: finding.isMandatory,
      ...(finding.expectedFormat ? { description: finding.expectedFormat } : {}),
    },
    confidence: clampConfidence(finding.confidence),
    ...provenanceOf(finding),
  };
}

/** V2 Sprint 4 §12 — RiskFinding → TENDER_RISK (toujours une proposition de création). `category`
 *  n'est reportée que si elle correspond (après normalisation) à une valeur du catalogue fermé
 *  `RiskCategory` de Tenders — sinon simplement omise, jamais une valeur invalide transmise. */
export function mapRiskFinding(finding: RiskFindingRecord): MappedSuggestion {
  const normalizedCategory = finding.category.trim().toUpperCase();

  return {
    entityType: AiSuggestionEntityType.TenderRisk,
    fieldName: CREATE_FIELD_SENTINEL,
    proposedValue: {
      title: finding.title,
      severity: finding.severity,
      description: finding.explanation,
      mitigation: finding.recommendation,
      ...(RISK_CATEGORIES.has(normalizedCategory) ? { category: normalizedCategory } : {}),
    },
    confidence: clampConfidence(finding.confidence),
    ...provenanceOf(finding),
  };
}
