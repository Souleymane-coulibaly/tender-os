import type { ChecklistItem, ChecklistItemType, ChecklistSubjectType } from "../../domain/checklist-item.entity";

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
/** Sprint 21 (hardening) — mission §26 (N+1) : opère désormais sur une liste DÉJÀ chargée par
 *  l'appelant, jamais une nouvelle lecture par appel. `reconcile-checklist-with-new-analysis.use-
 *  case.ts` appelait cette fonction une fois par suggestion proposée (N appels = N requêtes
 *  `listByTender` identiques) alors qu'il avait déjà chargé exactement cette même liste juste
 *  avant sa boucle. `create-checklist-item.use-case.ts` (un seul appel, jamais en boucle) charge
 *  la liste lui-même juste après avoir acquis `lockTenderForDedup` — la lecture doit rester APRÈS
 *  le verrou pour ne jamais lire un état obsolète (voir son propre commentaire). */
export function findChecklistDedupMatch(
  existingItems: readonly ChecklistItem[],
  input: { type: ChecklistItemType; lotId?: string | undefined; subjectType: ChecklistSubjectType; title: string },
): ChecklistDedupResult {
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
