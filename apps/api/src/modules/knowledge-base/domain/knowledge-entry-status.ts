import { InvalidKnowledgeEntryStatusError } from "./errors";

/**
 * Cycle de vie d'une entrée de connaissance (mission Sprint 5 §2) — même motif que
 * `DocumentExtractionStatus`/`AnalysisStatus` : une entrée manuelle (sans document) démarre et
 * reste `READY` immédiatement ; une entrée créée depuis un import démarre `DRAFT` puis transite
 * via le traitement du document associé. `ARCHIVED` est un état terminal atteignable depuis
 * n'importe quel statut non déjà archivé, jamais automatique.
 */
export const KnowledgeEntryStatus = {
  Draft: "DRAFT",
  Processing: "PROCESSING",
  Ready: "READY",
  PartiallyReady: "PARTIALLY_READY",
  Failed: "FAILED",
  Archived: "ARCHIVED",
} as const;

export type KnowledgeEntryStatus = (typeof KnowledgeEntryStatus)[keyof typeof KnowledgeEntryStatus];

export const ALLOWED_KNOWLEDGE_ENTRY_TRANSITIONS: Record<KnowledgeEntryStatus, readonly KnowledgeEntryStatus[]> = {
  [KnowledgeEntryStatus.Draft]: [
    KnowledgeEntryStatus.Processing,
    KnowledgeEntryStatus.Ready,
    KnowledgeEntryStatus.Archived,
  ],
  [KnowledgeEntryStatus.Processing]: [
    KnowledgeEntryStatus.Ready,
    KnowledgeEntryStatus.PartiallyReady,
    KnowledgeEntryStatus.Failed,
    KnowledgeEntryStatus.Archived,
  ],
  [KnowledgeEntryStatus.Ready]: [KnowledgeEntryStatus.Processing, KnowledgeEntryStatus.Archived],
  [KnowledgeEntryStatus.PartiallyReady]: [KnowledgeEntryStatus.Processing, KnowledgeEntryStatus.Archived],
  [KnowledgeEntryStatus.Failed]: [KnowledgeEntryStatus.Processing, KnowledgeEntryStatus.Archived],
  // Mission §11 "Archivage et restauration" — une restauration ramène toujours l'entrée à READY,
  // jamais un statut fictif "pré-archive" reconstruit : c'est le statut de base utilisable le plus
  // simple, cohérent avec "ne pas sur-concevoir". Les documents liés conservent leur propre statut
  // réel (voir `KnowledgeDocument.status`), consultable indépendamment.
  [KnowledgeEntryStatus.Archived]: [KnowledgeEntryStatus.Ready],
};

export function isKnowledgeEntryStatus(value: string): value is KnowledgeEntryStatus {
  return Object.values(KnowledgeEntryStatus).includes(value as KnowledgeEntryStatus);
}

export function parseKnowledgeEntryStatus(value: string): KnowledgeEntryStatus {
  if (!isKnowledgeEntryStatus(value)) {
    throw new InvalidKnowledgeEntryStatusError(value);
  }
  return value;
}
