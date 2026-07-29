import type { NormalizedExtractedContent } from "../../domain/extracted-content";

export type SegmentationConfig = Readonly<{
  /** Taille maximale d'un chunk, en caractères (mission §13 "impose une taille maximale"). */
  maxChunkCharacters: number;
  /** Chevauchement entre deux chunks consécutifs, en caractères (mission §13 "chevauchement
   *  configurable") — 0 désactive le chevauchement. */
  overlapCharacters: number;
}>;

/** Brouillon de chunk — jamais un `ExtractionChunk` complet : id/documentId/organizationId/
 *  checksum restent la responsabilité de l'orchestrateur (mission §13), le segmenteur reste une
 *  fonction pure de texte vers texte découpé, sans connaître l'identité du document. */
export type SegmentedChunkDraft = Readonly<{
  sequence: number;
  pageStart?: number | undefined;
  pageEnd?: number | undefined;
  sheetName?: string | undefined;
  sectionTitle?: string | undefined;
  content: string;
  tokenEstimate?: number | undefined;
}>;

/**
 * Segmentation déterministe (mission Sprint 3 §13) — jamais d'embeddings, jamais de modèle IA
 * branché ici (hors périmètre explicite). Le contrat reste synchrone dans son implémentation par
 * défaut (pure fonction de texte), mais async dans sa signature pour rester cohérent avec les
 * autres ports et permettre un futur segmenteur fondé sur un tokenizer externe sans changer
 * l'interface.
 */
export interface TextSegmenter {
  segment(content: NormalizedExtractedContent, config: SegmentationConfig): Promise<SegmentedChunkDraft[]>;
}

export const TEXT_SEGMENTER = Symbol("TEXT_SEGMENTER");
