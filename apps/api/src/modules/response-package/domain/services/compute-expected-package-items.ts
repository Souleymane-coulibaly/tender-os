import type { ChecklistItem } from "../../../tenders";
import { evaluateChecklistItemQualification } from "./evaluate-checklist-item-qualification";
import { mapChecklistItemTypeToCategory } from "./map-checklist-item-type-to-category";
import { PackageItemApplicabilityStatus, PackageItemCategory, PackageItemRequirementType, PackageItemSourceType } from "../enums";

/** Item d'une source "déjà produite ailleurs" (mission §15) — voir `BuildResponsePackageVersionUseCase`. */
export type ProducedElsewhereSource = Readonly<{ sourceId: string; lotId?: string | undefined; label: string; documentId: string; documentVersionId: string }>;

export type ExpectedPackageItemSpec = Readonly<{
  category: PackageItemCategory;
  label: string;
  sourceType: PackageItemSourceType;
  sourceId: string | undefined;
  documentId: string | undefined;
  documentVersionId: string | undefined;
  requirementType: PackageItemRequirementType;
  applicabilityStatus: PackageItemApplicabilityStatus;
  conditionText: string | undefined;
  lotId: string | undefined;
  expiresAt: Date | undefined;
}>;

function isRelevantToLot(itemLotId: string | undefined, packageLotId: string | undefined): boolean {
  return itemLotId === undefined || itemLotId === packageLotId;
}

/**
 * Checkpoint 2.1-P2.1-FIX-E — extrait de `BuildResponsePackageVersionUseCase` (mission §18
 * "réutiliser l'existant avant de créer de nouveaux concepts") : la logique PURE de calcul des
 * pièces ATTENDUES, réutilisée AUSSI par `GetResponsePackageFreshnessUseCase` pour comparer l'état
 * ATTENDU courant à l'état PERSISTÉ d'une version — jamais un second calcul divergent (même
 * discipline que `computeAnalysisFreshness`/`computeTechnicalMemoSectionFreshness`, "jamais deux
 * chemins de calcul distincts pour la même chose").
 */
export function computeExpectedPackageItems(input: {
  packageLotId: string | undefined;
  checklistItems: readonly ChecklistItem[];
  candidateContext: { isConsortiumBid: boolean; hasDeclaredSubcontractors: boolean };
  adminDocs: readonly { administrativeDocumentId: string; label: string; documentId: string; documentVersionId: string }[];
  technicalMemos: readonly { technicalMemoId: string; lotId?: string | undefined; label: string; documentId: string; documentVersionId: string }[];
  finalFiles: readonly { pricingScheduleId: string; lotId?: string | undefined; label: string; documentId: string; documentVersionId: string }[];
}): ExpectedPackageItemSpec[] {
  const items: ExpectedPackageItemSpec[] = [];

  for (const checklistItem of input.checklistItems) {
    if (!isRelevantToLot(checklistItem.lotId, input.packageLotId)) continue;
    const qualification = evaluateChecklistItemQualification({
      requirementLevel: checklistItem.requirementLevel,
      complianceStatus: checklistItem.complianceStatus,
      subjectType: checklistItem.subjectType,
      hasDeclaredSubcontractors: input.candidateContext.hasDeclaredSubcontractors,
      isConsortiumBid: input.candidateContext.isConsortiumBid,
    });
    items.push({
      category: mapChecklistItemTypeToCategory(checklistItem.type),
      label: checklistItem.title,
      sourceType: PackageItemSourceType.ChecklistItem,
      sourceId: checklistItem.id,
      documentId: checklistItem.matchedDocumentId,
      documentVersionId: checklistItem.matchedDocumentVersionId,
      requirementType: qualification.requirementType,
      applicabilityStatus: qualification.applicabilityStatus,
      conditionText: checklistItem.conditionText,
      lotId: input.packageLotId,
      expiresAt: checklistItem.documentExpiresAt,
    });
  }

  const addProducedElsewhere = (sources: readonly ProducedElsewhereSource[], category: PackageItemCategory, sourceType: PackageItemSourceType) => {
    for (const source of sources) {
      if (!isRelevantToLot(source.lotId, input.packageLotId)) continue;
      items.push({
        category,
        label: source.label,
        sourceType,
        sourceId: source.sourceId,
        documentId: source.documentId,
        documentVersionId: source.documentVersionId,
        requirementType: PackageItemRequirementType.Required,
        applicabilityStatus: PackageItemApplicabilityStatus.Applicable,
        conditionText: undefined,
        lotId: input.packageLotId,
        expiresAt: undefined,
      });
    }
  };

  addProducedElsewhere(
    input.adminDocs.map((d) => ({ sourceId: d.administrativeDocumentId, label: d.label, documentId: d.documentId, documentVersionId: d.documentVersionId })),
    PackageItemCategory.Administrative,
    PackageItemSourceType.AdministrativeDocument,
  );
  addProducedElsewhere(
    input.technicalMemos.map((m) => ({ sourceId: m.technicalMemoId, lotId: m.lotId, label: m.label, documentId: m.documentId, documentVersionId: m.documentVersionId })),
    PackageItemCategory.Technical,
    PackageItemSourceType.TechnicalMemo,
  );
  addProducedElsewhere(
    input.finalFiles.map((f) => ({ sourceId: f.pricingScheduleId, lotId: f.lotId, label: f.label, documentId: f.documentId, documentVersionId: f.documentVersionId })),
    PackageItemCategory.Financial,
    PackageItemSourceType.PricingScheduleFinalFile,
  );

  return items;
}

/** Clé stable d'identité pour comparer une pièce ATTENDUE à une pièce PERSISTÉE — même motif
 *  `(sourceType, sourceId)` qu'un `PackageItem` réel (mission §16). */
export function expectedPackageItemKey(item: Pick<ExpectedPackageItemSpec, "sourceType" | "sourceId">): string {
  return `${item.sourceType}:${item.sourceId ?? ""}`;
}
