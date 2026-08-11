import { PackageItemApplicabilityStatus, PackageItemRequirementType, PackageItemStatus } from "../enums";

/**
 * Règle de blocage (mission §3, §26-28, §97-102) — la SEULE fonction qui décide si une pièce
 * absente bloque le dossier. Un item CONDITIONAL dont l'applicabilité a été résolue à APPLICABLE
 * (mission §101 "sous-traitant présent → DC4 devient applicable... si REQUIRED + MISSING →
 * blocage") est traité comme un REQUIRED pour cette seule question — jamais son
 * `requirementType` d'origine n'est réécrit silencieusement, cette fonction reste purement une
 * LECTURE des deux axes (requirementType, applicabilityStatus).
 */
export function isBlockingIfMissing(input: { requirementType: PackageItemRequirementType; applicabilityStatus: PackageItemApplicabilityStatus }): boolean {
  if (input.applicabilityStatus !== PackageItemApplicabilityStatus.Applicable) return false;
  return input.requirementType === PackageItemRequirementType.Required || input.requirementType === PackageItemRequirementType.Conditional;
}

/**
 * Dérive le statut d'affichage d'un `PackageItem` (mission §26/§27/§70) — jamais assigné
 * directement, toujours recalculé depuis les 3 signaux réels : applicabilité, type d'obligation,
 * présence d'une `documentVersionId`. NOT_APPLICABLE et NEEDS_REVIEW priment toujours sur la
 * présence/absence du document (mission §29 "NOT_APPLICABLE... ne pas bloquer READY", §35 "ne pas
 * transformer NEEDS_REVIEW en document obligatoire manquant").
 */
export function derivePackageItemStatus(input: {
  requirementType: PackageItemRequirementType;
  applicabilityStatus: PackageItemApplicabilityStatus;
  hasDocumentVersion: boolean;
}): PackageItemStatus {
  if (input.applicabilityStatus === PackageItemApplicabilityStatus.NotApplicable) {
    return PackageItemStatus.NotApplicable;
  }
  if (input.applicabilityStatus === PackageItemApplicabilityStatus.NeedsReview) {
    return PackageItemStatus.NeedsReview;
  }
  if (input.hasDocumentVersion) {
    return PackageItemStatus.Ready;
  }
  return isBlockingIfMissing(input) ? PackageItemStatus.MissingBlocking : PackageItemStatus.MissingNonBlocking;
}
