import { expectedPackageItemKey, type ExpectedPackageItemSpec } from "./services/compute-expected-package-items";

/**
 * Checkpoint 2.1-P2.1-FIX-E — jamais persistée (même discipline que les autres checkpoints de
 * fraîcheur), calculée en LECTURE SEULE.
 *
 * Dimensions réellement retenues (audit ciblé avant codage) :
 * - CANDIDATE — `Tender.candidateCompanyId`, toujours comparé.
 * - PIÈCES ATTENDUES — compare l'ensemble ATTENDU recalculé MAINTENANT
 *   (`computeExpectedPackageItems`, la MÊME fonction pure que `BuildResponsePackageVersionUseCase`
 *   utilise pour construire une version — jamais un second calcul divergent) à l'ensemble PERSISTÉ
 *   au moment de cette version, clé par `(sourceType, sourceId)` : toute pièce dont la
 *   `documentVersionId`/`requirementType`/`applicabilityStatus` courante diffère de ce qui a été
 *   figé, toute pièce ATTENDUE apparue depuis, ou toute pièce persistée dont la source a disparu,
 *   rend le package STALE. Couvre INDIRECTEMENT Technical Memo/dossier administratif/chiffrage
 *   final (leurs `documentVersionId` respectifs) SANS jamais fabriquer une dépendance DIRECTE au
 *   DCE/Analysis/GO-NO-GO — audit confirmé qu'aucun n'est jamais lu par ce module.
 *
 * Limite honnête documentée (KNOWN_GAP, non bloquant) — une correction humaine
 * (`SelectPackageItemDocumentUseCase`/`CorrectPackageItemQualificationUseCase`) peut faire diverger
 * volontairement une pièce persistée de sa valeur "auto-calculée" ; cette comparaison la signalera
 * alors STALE même si rien n'a réellement changé depuis la correction — un faux STALE prudent,
 * jamais un faux CURRENT (mission "jamais un false CURRENT" reste respectée).
 */
export const ResponsePackageFreshness = { Current: "CURRENT", Stale: "STALE", Unknown: "UNKNOWN" } as const;
export type ResponsePackageFreshness = (typeof ResponsePackageFreshness)[keyof typeof ResponsePackageFreshness];

export type PersistedPackageItemForFreshness = Readonly<{
  sourceType: ExpectedPackageItemSpec["sourceType"];
  sourceId: string | undefined;
  documentVersionId: string | undefined;
  requirementType: ExpectedPackageItemSpec["requirementType"];
  applicabilityStatus: ExpectedPackageItemSpec["applicabilityStatus"];
}>;

export type ResponsePackageFreshnessInput = Readonly<{
  /** `null` si le `ResponsePackage` n'a encore AUCUNE version construite. */
  version: Readonly<{ candidateCompanyId: string | undefined; items: readonly PersistedPackageItemForFreshness[] }> | null;
  currentCandidateCompanyId: string | undefined;
  currentExpectedItems: readonly PersistedPackageItemForFreshness[];
}>;

export function computeResponsePackageFreshness(input: ResponsePackageFreshnessInput): ResponsePackageFreshness {
  if (!input.version) return ResponsePackageFreshness.Unknown;

  // Mission §38/§73 — un changement de Candidate rend le package STALE.
  if (input.version.candidateCompanyId !== input.currentCandidateCompanyId) {
    return ResponsePackageFreshness.Stale;
  }

  const persistedByKey = new Map(input.version.items.map((item) => [expectedPackageItemKey(item), item]));
  const currentByKey = new Map(input.currentExpectedItems.map((item) => [expectedPackageItemKey(item), item]));

  for (const [key, current] of currentByKey) {
    const persisted = persistedByKey.get(key);
    // Mission §35/§40 — une pièce ATTENDUE aujourd'hui qui n'existait pas au moment de cette
    // version (nouvelle exigence Checklist, nouveau document produit ailleurs) rend le package
    // STALE.
    if (!persisted) return ResponsePackageFreshness.Stale;
    if (
      persisted.documentVersionId !== current.documentVersionId ||
      persisted.requirementType !== current.requirementType ||
      persisted.applicabilityStatus !== current.applicabilityStatus
    ) {
      return ResponsePackageFreshness.Stale;
    }
  }

  // Une pièce persistée dont la source a disparu depuis (item Checklist supprimé, document source
  // retiré) — le package ne reflète plus fidèlement l'état courant.
  for (const key of persistedByKey.keys()) {
    if (!currentByKey.has(key)) return ResponsePackageFreshness.Stale;
  }

  return ResponsePackageFreshness.Current;
}
