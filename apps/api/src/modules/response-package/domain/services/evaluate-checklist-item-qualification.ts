import { PackageItemApplicabilityStatus, PackageItemRequirementType } from "../enums";

/** Sous-ensemble des vocabulaires `tenders/domain/checklist-item.entity.ts` (Sprint 6) réellement
 *  nécessaires ici — jamais une réimportation du type complet à travers la frontière du module
 *  (Checklist reste la source, ce module ne connaît que ces 3 chaînes littérales). */
export type ChecklistRequirementLevelInput = "MANDATORY" | "CONDITIONAL" | "INFORMATIONAL";
export type ChecklistSubjectTypeInput = "CANDIDATE" | "GROUP_MEMBER" | "SUBCONTRACTOR" | "ANY_MEMBER" | "TENDER" | "LOT";

export type PackageItemQualification = Readonly<{
  requirementType: PackageItemRequirementType;
  applicabilityStatus: PackageItemApplicabilityStatus;
}>;

function mapRequirementType(level: ChecklistRequirementLevelInput): PackageItemRequirementType {
  switch (level) {
    case "MANDATORY":
      return PackageItemRequirementType.Required;
    case "INFORMATIONAL":
      return PackageItemRequirementType.Optional;
    case "CONDITIONAL":
      return PackageItemRequirementType.Conditional;
  }
}

/**
 * Qualification initiale d'un `PackageItem` créé à partir d'un `ChecklistItem` (mission §20/§28/
 * §39/§40) — une PROPOSITION explicable, jamais un blocage automatique sur une déduction
 * incertaine (mission §3 "si l'obligation ou l'applicabilité est ambiguë : NEEDS_REVIEW"). Reste
 * toujours corrigible ensuite par un utilisateur autorisé (mission §21/§72), sans jamais modifier
 * la Checklist elle-même (mission §32).
 *
 * - `complianceStatus === "NOT_APPLICABLE"` (déjà décidé humainement au niveau Checklist) prime
 *   sur tout le reste.
 * - MANDATORY/INFORMATIONAL sont applicables par défaut (mission §39 "évaluer selon le contexte"
 *   ne s'applique explicitement qu'aux items CONDITIONAL).
 * - CONDITIONAL est résolu UNIQUEMENT pour les deux cas explicitement documentés par la mission
 *   (§39/§40 — sous-traitant déclaré, groupement) : SUBCONTRACTOR/GROUP_MEMBER avec un signal de
 *   présence connu. Tout le reste (variante, lot, certification liée à une activité précise...)
 *   reste NEEDS_REVIEW — cette fonction ne prétend jamais évaluer une condition qu'elle ne
 *   comprend pas réellement (mission "jamais prétendre supporter plus que ce qui est fait").
 */
export function evaluateChecklistItemQualification(input: {
  requirementLevel: ChecklistRequirementLevelInput;
  complianceStatus: string;
  subjectType: ChecklistSubjectTypeInput;
  hasDeclaredSubcontractors: boolean;
  isConsortiumBid: boolean;
}): PackageItemQualification {
  const requirementType = mapRequirementType(input.requirementLevel);

  if (input.complianceStatus === "NOT_APPLICABLE") {
    return { requirementType, applicabilityStatus: PackageItemApplicabilityStatus.NotApplicable };
  }

  if (input.requirementLevel !== "CONDITIONAL") {
    return { requirementType, applicabilityStatus: PackageItemApplicabilityStatus.Applicable };
  }

  if (input.subjectType === "SUBCONTRACTOR") {
    return { requirementType, applicabilityStatus: input.hasDeclaredSubcontractors ? PackageItemApplicabilityStatus.Applicable : PackageItemApplicabilityStatus.NotApplicable };
  }
  if (input.subjectType === "GROUP_MEMBER") {
    return { requirementType, applicabilityStatus: input.isConsortiumBid ? PackageItemApplicabilityStatus.Applicable : PackageItemApplicabilityStatus.NotApplicable };
  }

  return { requirementType, applicabilityStatus: PackageItemApplicabilityStatus.NeedsReview };
}
