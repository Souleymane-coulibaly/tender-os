import { AiSuggestionEntityType } from "../../../ai-suggestion";
import { CREATE_FIELD_SENTINEL } from "../../../ai-suggestion-bridge";
import { DeadlineKind } from "../../domain/business/deadline-kind";
import { RequirementCategory } from "../../domain/business/requirement-category";
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

/** V2 Sprint 6 §5/§9 — correspondance gouvernée `RequirementCategory` (analysis) -> catalogue
 *  ChecklistItemType (tenders). Jamais une valeur devinée à l'exécution : une catégorie absente de
 *  cette table retombe sur OTHER, jamais une exception. */
const REQUIREMENT_CATEGORY_TO_CHECKLIST_TYPE: Record<string, string> = {
  [RequirementCategory.Administrative]: "ADMINISTRATIVE_DOCUMENT",
  [RequirementCategory.TechnicalMemo]: "TECHNICAL_DOCUMENT",
  [RequirementCategory.References]: "REFERENCE",
  [RequirementCategory.Cv]: "TECHNICAL_DOCUMENT",
  [RequirementCategory.Certification]: "CERTIFICATION",
  [RequirementCategory.Insurance]: "INSURANCE",
  [RequirementCategory.FinancialCapacity]: "FINANCIAL_REQUIREMENT",
  [RequirementCategory.TechnicalCapacity]: "TECHNICAL_REQUIREMENT",
  [RequirementCategory.HumanResources]: "TECHNICAL_REQUIREMENT",
  [RequirementCategory.MaterialResources]: "TECHNICAL_REQUIREMENT",
  [RequirementCategory.Methodology]: "TECHNICAL_REQUIREMENT",
  [RequirementCategory.Planning]: "TECHNICAL_DOCUMENT",
  [RequirementCategory.Signature]: "SIGNATURE",
  [RequirementCategory.Other]: "OTHER",
};

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
 * générique) ou TENDER_MILESTONE (les autres natures d'échéance). Tableau vide si le finding ne
 * porte qu'un `rawText` sans date normalisée exploitable — jamais une suggestion avec une date
 * devinée (mission "aucune hallucination").
 *
 * V2 Sprint 6 §9 — AJOUT (n'affecte pas la suggestion ci-dessus) : une échéance de nature VISIT
 * implique structurellement une action/un livrable (se rendre sur place + obtenir une attestation
 * de visite) — seule nature d'échéance dont ce sprint considère qu'elle "nécessite une action",
 * règle explicite et étroite plutôt qu'une heuristique sur texte libre (mission §6 : "jamais
 * transformer une condition ambiguë en obligation certaine"). Une seconde suggestion CHECKLIST_ITEM
 * est alors émise EN PLUS de la suggestion TENDER_FIELD existante — deux préoccupations
 * différentes (la date elle-même vs. la pièce/action à préparer), jamais un doublon.
 */
export function mapDeadlineFinding(finding: DeadlineFindingRecord): readonly MappedSuggestion[] {
  if (!finding.date) {
    return [];
  }

  const base = { confidence: clampConfidence(finding.confidence), ...provenanceOf(finding) };
  const suggestions: MappedSuggestion[] = [];

  switch (finding.kind) {
    case DeadlineKind.Submission:
      suggestions.push({ ...base, entityType: AiSuggestionEntityType.TenderField, fieldName: "submissionDeadline", proposedValue: finding.date });
      break;
    case DeadlineKind.Questions:
      suggestions.push({ ...base, entityType: AiSuggestionEntityType.TenderField, fieldName: "questionsDeadline", proposedValue: finding.date });
      break;
    case DeadlineKind.Visit:
      suggestions.push({ ...base, entityType: AiSuggestionEntityType.TenderField, fieldName: "visitDate", proposedValue: finding.date });
      break;
    case DeadlineKind.Publication:
      suggestions.push({ ...base, entityType: AiSuggestionEntityType.TenderField, fieldName: "publicationDate", proposedValue: finding.date });
      break;
    case DeadlineKind.StartEstimated:
      suggestions.push({ ...base, entityType: AiSuggestionEntityType.TenderField, fieldName: "estimatedStartDate", proposedValue: finding.date });
      break;
    default:
      // ANSWER / VALIDITY_PERIOD / INTERMEDIATE / CONTRACTUAL / OTHER — aucun champ Tender
      // générique ne convient, mission §9 : devient un jalon (type CUSTOM, seule valeur du
      // catalogue MilestoneType qui ne présuppose pas une nature déjà connue).
      suggestions.push({
        ...base,
        entityType: AiSuggestionEntityType.TenderMilestone,
        fieldName: CREATE_FIELD_SENTINEL,
        proposedValue: {
          title: finding.label,
          date: finding.date,
          type: "CUSTOM",
          ...(finding.rawText ? { description: finding.rawText } : {}),
        },
      });
  }

  if (finding.kind === DeadlineKind.Visit) {
    suggestions.push({
      ...base,
      entityType: AiSuggestionEntityType.ChecklistItem,
      fieldName: CREATE_FIELD_SENTINEL,
      proposedValue: {
        title: finding.label,
        type: "VISIT",
        requirementLevel: "MANDATORY",
        dueDate: finding.date,
        ...(finding.rawText ? { description: finding.rawText } : {}),
      },
    });
  }

  return suggestions;
}

/**
 * V2 Sprint 4 §9 — CriterionFinding → TENDER_AWARD_CRITERION (toujours une proposition de
 * création). Tableau vide si aucune pondération n'a été extraite : `weight` est requis par
 * `CreateAwardCriterionUseCase`, jamais une valeur fabriquée à sa place.
 *
 * V2 Sprint 6 §9 — AJOUT (n'affecte pas la suggestion ci-dessus) : un critère ÉLIMINATOIRE implique
 * structurellement une preuve/un seuil à documenter pour la candidature — seule condition explicite
 * et gouvernée retenue ce sprint (mission §9 "uniquement lorsqu'il implique une preuve/document à
 * préparer", §6 "jamais une condition ambiguë transformée en obligation certaine"). Criticité
 * BLOCKING proposée par l'IA (l'absence de preuve peut structurellement invalider la candidature),
 * toujours corrigible par l'utilisateur (mission §7).
 */
export function mapCriterionFinding(finding: CriterionFindingRecord): readonly MappedSuggestion[] {
  if (finding.weight === undefined || finding.weight === null) {
    return [];
  }

  const provenance = provenanceOf(finding);
  const confidence = clampConfidence(finding.confidence);
  const suggestions: MappedSuggestion[] = [
    {
      entityType: AiSuggestionEntityType.TenderAwardCriterion,
      fieldName: CREATE_FIELD_SENTINEL,
      proposedValue: {
        name: finding.name,
        weight: String(finding.weight),
        ...(finding.scoringMethod ? { scoringMethod: finding.scoringMethod } : {}),
        ...(finding.isEliminatory && finding.threshold ? { eliminationThreshold: finding.threshold } : {}),
      },
      confidence,
      ...provenance,
    },
  ];

  if (finding.isEliminatory) {
    suggestions.push({
      entityType: AiSuggestionEntityType.ChecklistItem,
      fieldName: CREATE_FIELD_SENTINEL,
      proposedValue: {
        title: finding.name,
        type: "TECHNICAL_REQUIREMENT",
        requirementLevel: "MANDATORY",
        criticality: "BLOCKING",
        ...(finding.threshold ? { description: `Seuil éliminatoire : ${finding.threshold}` } : {}),
      },
      confidence,
      ...provenance,
    });
  }

  return suggestions;
}

/**
 * V2 Sprint 6 §9-10 — CHANGEMENT DE RESPONSABILITÉ (audit Codex, décision produit confirmée) :
 * RequirementFinding cible désormais EXCLUSIVEMENT CHECKLIST_ITEM, plus TENDER_REQUESTED_DOCUMENT
 * (mapping Sprint 4 §10 d'origine). Les `TenderRequestedDocument` déjà créés par des suggestions
 * PRÉ-Sprint-6 restent en base, inchangés, toujours lisibles/utilisables par leur API/UI existante
 * — seule la génération de NOUVELLES suggestions change de cible ; les pièces demandées manuelles
 * (créées hors suggestion, jamais issues d'un Finding) restent également inchangées. Toujours une
 * proposition de création (§10 "toujours").
 */
export function mapRequirementFinding(finding: RequirementFindingRecord): readonly MappedSuggestion[] {
  return [
    {
      entityType: AiSuggestionEntityType.ChecklistItem,
      fieldName: CREATE_FIELD_SENTINEL,
      proposedValue: {
        title: finding.label,
        type: REQUIREMENT_CATEGORY_TO_CHECKLIST_TYPE[finding.category] ?? "OTHER",
        requirementLevel: finding.isMandatory ? "MANDATORY" : "CONDITIONAL",
        ...(finding.expectedFormat ? { description: finding.expectedFormat } : {}),
      },
      confidence: clampConfidence(finding.confidence),
      ...provenanceOf(finding),
    },
  ];
}

/** V2 Sprint 4 §12 — RiskFinding → TENDER_RISK (toujours une proposition de création). `category`
 *  n'est reportée que si elle correspond (après normalisation) à une valeur du catalogue fermé
 *  `RiskCategory` de Tenders — sinon simplement omise, jamais une valeur invalide transmise.
 *  V2 Sprint 6 §9 — ne devient JAMAIS un ChecklistItem (mission explicite : "ne devient pas
 *  automatiquement ChecklistItem"), inchangé par rapport au Sprint 4. */
export function mapRiskFinding(finding: RiskFindingRecord): readonly MappedSuggestion[] {
  const normalizedCategory = finding.category.trim().toUpperCase();

  return [
    {
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
    },
  ];
}
