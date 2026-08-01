import { InvalidGenerationStatusError } from "./errors";

/**
 * Cycle de vie d'une génération (mission Sprint 6) — même motif que `AnalysisStatus` : réservation
 * atomique courte (PENDING → GENERATING), appel provider hors transaction, finalisation atomique
 * courte. Pas de `PARTIALLY_GENERATED` (une tâche de génération produit un contenu cohérent unique,
 * contrairement à l'analyse multi-catégories d'Analysis) ni de `REVIEWED`/`VALIDATED`/`REJECTED` :
 * "édité" et "validé" sont des FAITS portés par des colonnes sur la même ligne terminale
 * (`editedBy`/`editedAt`, `validatedBy`/`validatedAt`), jamais des transitions qui rouvriraient la
 * ligne (mission §"Le contenu généré ne doit pas être considéré comme final automatiquement" est
 * satisfaite par ces colonnes, pas par un état).
 */
export const GenerationStatus = {
  Pending: "PENDING",
  Generating: "GENERATING",
  Generated: "GENERATED",
  Failed: "FAILED",
  Cancelled: "CANCELLED",
} as const;

export type GenerationStatus = (typeof GenerationStatus)[keyof typeof GenerationStatus];

/** FAILED → PENDING autorise un retry explicite (voir RetryGenerationUseCase). PENDING/GENERATING
 *  → CANCELLED autorise une annulation explicite. Aucun état terminal ne rouvre autrement. */
export const ALLOWED_GENERATION_TRANSITIONS: Record<GenerationStatus, readonly GenerationStatus[]> = {
  [GenerationStatus.Pending]: [GenerationStatus.Generating, GenerationStatus.Cancelled],
  [GenerationStatus.Generating]: [GenerationStatus.Generated, GenerationStatus.Failed, GenerationStatus.Cancelled],
  [GenerationStatus.Failed]: [GenerationStatus.Pending],
  [GenerationStatus.Generated]: [],
  [GenerationStatus.Cancelled]: [],
};

export function isGenerationStatus(value: string): value is GenerationStatus {
  return Object.values(GenerationStatus).includes(value as GenerationStatus);
}

export function parseGenerationStatus(value: string): GenerationStatus {
  if (!isGenerationStatus(value)) {
    throw new InvalidGenerationStatusError(value);
  }
  return value;
}

export function isTerminalGenerationStatus(status: GenerationStatus): boolean {
  return ALLOWED_GENERATION_TRANSITIONS[status].length === 0;
}
