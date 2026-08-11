import { isBlockingIfMissing } from "./derive-package-item-status";
import { PackageItemApplicabilityStatus, PackageItemRequirementType } from "../enums";

export type PackageCompletenessLineInput = Readonly<{
  id: string;
  label: string;
  requirementType: PackageItemRequirementType;
  applicabilityStatus: PackageItemApplicabilityStatus;
  hasDocumentVersion: boolean;
}>;

export type PackageCompletenessResult = Readonly<{
  requiredApplicableTotal: number;
  requiredAvailable: number;
  requiredMissing: number;
  requiredMissingLabels: readonly string[];
  optionalApplicableTotal: number;
  optionalAvailable: number;
  optionalMissing: number;
  notApplicableTotal: number;
  needsReviewTotal: number;
  /** Mission §5 — ratio calculé UNIQUEMENT sur les pièces réellement obligatoires ET applicables
   *  (22/22, jamais 22/27) : `undefined` si aucune pièce n'est réellement requise (rien à diviser,
   *  jamais un 100% ou 0% arbitraire dans ce cas). */
  requiredCompletenessRatio: number | undefined;
  /** Mission §34 — aucune pièce REQUIRED+APPLICABLE manquante. Un OPTIONAL absent ou un
   *  NEEDS_REVIEW n'empêche JAMAIS ready. */
  ready: boolean;
}>;

/**
 * Calcul de complétude (mission §5/§33-34) — jamais un ratio sur TOUTES les pièces (mission "22/22
 * = 100%, et NON 22/27"). Recalculé à chaque lecture (mission — même motif que les contrôles
 * Sprint 13), jamais un pourcentage persisté et potentiellement obsolète.
 */
export function computePackageCompleteness(items: readonly PackageCompletenessLineInput[]): PackageCompletenessResult {
  let requiredApplicableTotal = 0;
  let requiredAvailable = 0;
  const requiredMissingLabels: string[] = [];
  let optionalApplicableTotal = 0;
  let optionalAvailable = 0;
  let notApplicableTotal = 0;
  let needsReviewTotal = 0;

  for (const item of items) {
    if (item.applicabilityStatus === PackageItemApplicabilityStatus.NotApplicable) {
      notApplicableTotal += 1;
      continue;
    }
    if (item.applicabilityStatus === PackageItemApplicabilityStatus.NeedsReview) {
      needsReviewTotal += 1;
      continue;
    }

    if (isBlockingIfMissing(item)) {
      requiredApplicableTotal += 1;
      if (item.hasDocumentVersion) requiredAvailable += 1;
      else requiredMissingLabels.push(item.label);
    } else if (item.requirementType === PackageItemRequirementType.Optional) {
      optionalApplicableTotal += 1;
      if (item.hasDocumentVersion) optionalAvailable += 1;
    }
  }

  return {
    requiredApplicableTotal,
    requiredAvailable,
    requiredMissing: requiredMissingLabels.length,
    requiredMissingLabels,
    optionalApplicableTotal,
    optionalAvailable,
    optionalMissing: optionalApplicableTotal - optionalAvailable,
    notApplicableTotal,
    needsReviewTotal,
    requiredCompletenessRatio: requiredApplicableTotal === 0 ? undefined : requiredAvailable / requiredApplicableTotal,
    ready: requiredMissingLabels.length === 0,
  };
}
