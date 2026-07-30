import { InvalidKnowledgeSourceTypeError } from "./errors";

/** Origine du contenu d'une entrée (mission Sprint 5 §2) — MANUAL : texte/métadonnées saisis
 *  directement, jamais de document associé au départ. DOCUMENT_IMPORT : créée à partir d'un
 *  document importé, enrichie par extraction automatique (voir `KnowledgeDocument`). */
export const KnowledgeSourceType = {
  Manual: "MANUAL",
  DocumentImport: "DOCUMENT_IMPORT",
} as const;

export type KnowledgeSourceType = (typeof KnowledgeSourceType)[keyof typeof KnowledgeSourceType];

export function isKnowledgeSourceType(value: string): value is KnowledgeSourceType {
  return Object.values(KnowledgeSourceType).includes(value as KnowledgeSourceType);
}

export function parseKnowledgeSourceType(value: string): KnowledgeSourceType {
  if (!isKnowledgeSourceType(value)) {
    throw new InvalidKnowledgeSourceTypeError(value);
  }
  return value;
}
