/**
 * Base commune des erreurs Domain (skills/platform-foundation/ARCHITECTURE_RULES.md §36 —
 * "erreurs techniques communes" est un contenu de Shared Kernel accepté).
 *
 * Ne contient ni statut HTTP, ni détail technique : voir
 * skills/platform-foundation/MODULE_TEMPLATE.md §18. Le mapping vers un statut HTTP
 * reste la responsabilité de chaque module, au plus près de ses propres codes.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
}
