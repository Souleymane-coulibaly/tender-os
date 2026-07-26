import { InvalidDocumentOriginError } from "./errors";

/**
 * Provenance du document (conception validée §3/§V) — prépare les futurs modules
 * (DCE, génération IA, modèles) sans les implémenter : seule la valeur est stockée,
 * aucun comportement n'y est encore attaché.
 */
export const DocumentOrigin = {
  UserUpload: "USER_UPLOAD",
  Dce: "DCE",
  Template: "TEMPLATE",
  Generated: "GENERATED",
  Imported: "IMPORTED",
} as const;

export type DocumentOrigin = (typeof DocumentOrigin)[keyof typeof DocumentOrigin];

export function isDocumentOrigin(value: string): value is DocumentOrigin {
  return Object.values(DocumentOrigin).includes(value as DocumentOrigin);
}

export function parseDocumentOrigin(value: string): DocumentOrigin {
  if (!isDocumentOrigin(value)) {
    throw new InvalidDocumentOriginError(value);
  }
  return value;
}
