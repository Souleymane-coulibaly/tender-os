import type { ExtractedContent } from "./extracted-content";
import { CharacterLimitExceededError } from "./extraction-errors";

/**
 * Limite de caractères (correction P1-03) — appliquée juste après l'extraction brute, AVANT la
 * normalisation et la segmentation : un dépassement arrête proprement le traitement plutôt que de
 * laisser la normalisation/segmentation construire des structures inutiles sur un contenu déjà
 * trop volumineux. Point d'application unique pour toutes les stratégies (natif, OCR, Office,
 * tableur) — un contrôle, jamais quatre implémentations divergentes.
 *
 * Limite documentée : `pdf-parse`/`mammoth` ne proposent pas d'extraction incrémentale, le
 * contenu complet est donc déjà en mémoire avant ce contrôle pour ces deux stratégies (jamais une
 * reconstruction de bibliothèque tierce dans ce sprint). L'extraction OCR, elle, vérifie en plus
 * le total de manière incrémentale page par page (voir `runOcrExtraction`) et peut arrêter avant
 * d'appeler l'OCR sur les pages restantes — un gain réel, pas seulement théorique.
 */
export function assertWithinCharacterLimit(content: ExtractedContent, maxCharacters: number): void {
  const characterCount = content.units.reduce((sum, unit) => sum + unit.text.length, 0);
  if (characterCount > maxCharacters) {
    throw new CharacterLimitExceededError({ characterCount, maxCharacters });
  }
}
