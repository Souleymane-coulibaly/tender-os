/**
 * Classification initiale d'un fichier du DCE (mission architecture §7 — "classification
 * initiale") : catégories métier usuelles d'un dossier de consultation français, déduites par des
 * règles déterministes (voir dce-document-classifier.ts), jamais par un fournisseur IA — ce champ
 * doit rester remplaçable par une classification IA plus tard sans changer sa forme.
 */
export const DceDocumentCategory = {
  Administrative: "ADMINISTRATIVE",
  Technical: "TECHNICAL",
  Financial: "FINANCIAL",
  Drawings: "DRAWINGS",
  Other: "OTHER",
} as const;

export type DceDocumentCategory = (typeof DceDocumentCategory)[keyof typeof DceDocumentCategory];

export function isDceDocumentCategory(value: string): value is DceDocumentCategory {
  return Object.values(DceDocumentCategory).includes(value as DceDocumentCategory);
}
