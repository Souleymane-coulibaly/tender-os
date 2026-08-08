import type { ChecklistItemRepository } from "../ports/checklist-item.repository";
import type { ChecklistItemType, ChecklistSubjectType } from "../../domain/checklist-item.entity";

const AUTO_MERGE_THRESHOLD = 0.92;
const POSSIBLE_DUPLICATE_THRESHOLD = 0.75;

export type ChecklistDedupResult =
  | { kind: "merge"; existingItemId: string; similarity: number }
  | { kind: "possible_duplicate"; existingItemId: string; similarity: number }
  | { kind: "new" };

/** Normalisation simple (minuscules, accents retirés, espaces compactés) — même esprit que
 *  `normalizeClientAccountName` (client-portfolio), pas de dépendance externe. */
function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Similarité de Jaccard sur l'ensemble des mots normalisés — suffisant pour détecter "Fournir une
 *  attestation d'assurance" ~ "Attestation d'assurance RC Pro", sans dépendance externe (mission
 *  §11 : pas de nouveau RAG/matching sémantique pour ce besoin non plus). */
function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeTitle(a).split(" ").filter(Boolean));
  const wordsB = new Set(normalizeTitle(b).split(" ").filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter((word) => wordsB.has(word)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * V2 Sprint 6 §11 — anti-doublon, appelé UNIQUEMENT pour les créations d'origine IA (jamais une
 * création manuelle : un humain choisit déjà explicitement de créer). Compare au sein du MÊME
 * Tender, même `type`/`lotId`/`subjectType`, par similarité de titre normalisé.
 * - `≥ 0.92` -> fusion automatique (l'appelant ajoute une `TenderChecklistItemSource` à l'item
 *   existant, ne crée JAMAIS un second `ChecklistItem`).
 * - `0.75-0.92` -> suggestion créée normalement, mais taguée `possibleDuplicateOfItemId` pour hint UI.
 * - `< 0.75` -> aucune relation, création normale.
 */
export async function findChecklistDedupMatch(
  checklistRepository: ChecklistItemRepository,
  input: { organizationId: string; tenderId: string; type: ChecklistItemType; lotId?: string | undefined; subjectType: ChecklistSubjectType; title: string },
): Promise<ChecklistDedupResult> {
  const existingItems = await checklistRepository.listByTender({ organizationId: input.organizationId, tenderId: input.tenderId });

  let best: { itemId: string; similarity: number } | undefined;
  for (const item of existingItems) {
    if (item.type !== input.type || item.subjectType !== input.subjectType || item.lotId !== input.lotId) continue;
    const similarity = titleSimilarity(item.title, input.title);
    if (best === undefined || similarity > best.similarity) {
      best = { itemId: item.id, similarity };
    }
  }

  if (best === undefined || best.similarity < POSSIBLE_DUPLICATE_THRESHOLD) {
    return { kind: "new" };
  }
  if (best.similarity >= AUTO_MERGE_THRESHOLD) {
    return { kind: "merge", existingItemId: best.itemId, similarity: best.similarity };
  }
  return { kind: "possible_duplicate", existingItemId: best.itemId, similarity: best.similarity };
}
