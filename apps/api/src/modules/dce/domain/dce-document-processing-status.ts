/**
 * État de traitement d'un fichier du DCE, distinct de `DceStatus` (qui porte le cycle de vie du
 * DCE entier, pas d'un fichier précis) — mission architecture §7 "préparation OCR", révisé après
 * audit (mission P1-3) : `READY_FOR_OCR` ne doit plus être attribué à tout fichier accepté sans
 * distinction, sous peine de mentir sur l'éligibilité réelle à l'OCR.
 *
 * Cette tranche reste déterministe sur la seule extension (jamais le contenu binaire, jamais
 * d'IA) — voir `determineDceDocumentProcessingStatus` :
 * - PNG/JPEG  → READY_FOR_OCR (image, candidat OCR confiant).
 * - PDF       → PENDING_TEXT_INSPECTION : impossible de distinguer un PDF texte d'un PDF scanné
 *   sans ouvrir le contenu dans cette tranche — la décision (OCR ou extraction native) est
 *   reportée explicitement au Sprint OCR, jamais devinée ici.
 * - DOCX/XLSX/XLS → READY_FOR_NATIVE_EXTRACTION : extraction structurée, jamais un OCR direct.
 * - tout le reste → NOT_PROCESSABLE (défensif : aucun format actuellement accepté par
 *   `ALLOWED_DCE_FILE_TYPES` ne tombe ici aujourd'hui, mais un futur élargissement de la liste ne
 *   doit jamais retomber silencieusement sur READY_FOR_OCR).
 */
export const DceDocumentProcessingStatus = {
  Imported: "IMPORTED",
  ReadyForOcr: "READY_FOR_OCR",
  PendingTextInspection: "PENDING_TEXT_INSPECTION",
  ReadyForNativeExtraction: "READY_FOR_NATIVE_EXTRACTION",
  NotProcessable: "NOT_PROCESSABLE",
} as const;

export type DceDocumentProcessingStatus = (typeof DceDocumentProcessingStatus)[keyof typeof DceDocumentProcessingStatus];

export function isDceDocumentProcessingStatus(value: string): value is DceDocumentProcessingStatus {
  return Object.values(DceDocumentProcessingStatus).includes(value as DceDocumentProcessingStatus);
}

const OCR_ELIGIBLE_EXTENSIONS = new Set(["png", "jpg", "jpeg"]);
const NATIVE_EXTRACTION_EXTENSIONS = new Set(["docx", "xlsx", "xls"]);

/** Décide le statut de préparation atteignable à l'import (déterministe, extension seule) —
 *  jamais READY_FOR_OCR par défaut : un format non reconnu ici est NOT_PROCESSABLE, jamais une
 *  supposition optimiste. */
export function determineDceDocumentProcessingStatus(extension: string): DceDocumentProcessingStatus {
  const normalized = extension.toLowerCase().replace(/^\./, "");

  if (OCR_ELIGIBLE_EXTENSIONS.has(normalized)) {
    return DceDocumentProcessingStatus.ReadyForOcr;
  }
  if (normalized === "pdf") {
    return DceDocumentProcessingStatus.PendingTextInspection;
  }
  if (NATIVE_EXTRACTION_EXTENSIONS.has(normalized)) {
    return DceDocumentProcessingStatus.ReadyForNativeExtraction;
  }
  return DceDocumentProcessingStatus.NotProcessable;
}
