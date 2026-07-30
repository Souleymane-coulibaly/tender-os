/**
 * Classification métier d'un document DCE (mission Sprint 4.2 §"Documents à analyser") —
 * déterminée par le modèle IA à partir du contenu réel, distincte de `DceDocumentCategory`
 * (module DCE, classification déterministe par extension/nom de fichier, Sprint 2) : les deux
 * classifications coexistent sans jamais se fusionner ni s'écraser l'une l'autre.
 */
export const DocumentClassification = {
  Rc: "RC",
  Cctp: "CCTP",
  Ccap: "CCAP",
  Ae: "AE",
  Bpu: "BPU",
  Dpgf: "DPGF",
  Annex: "ANNEX",
  Unknown: "UNKNOWN",
} as const;

export type DocumentClassification = (typeof DocumentClassification)[keyof typeof DocumentClassification];

export function isDocumentClassification(value: string): value is DocumentClassification {
  return Object.values(DocumentClassification).includes(value as DocumentClassification);
}
