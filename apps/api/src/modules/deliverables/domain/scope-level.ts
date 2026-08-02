/**
 * Mission Sprint 8A.1 §5/§6 — hiérarchie de résolution des templates/thèmes.
 *
 * Correctif audit Codex P1-004 — la décision de portée initiale mappait "système TenderOS" sur le
 * palier ORGANIZATION (aucun seed inter-organisation), ce qui NE fournissait aucun repli quand une
 * organisation elle-même n'a rien configuré. Un 4e palier `TENDEROS` distinct est ajouté ici comme
 * dernier repli global : une ressource TENDEROS n'appartient à AUCUNE organisation réelle, elle vit
 * sous `SYSTEM_ORGANIZATION_ID` (voir `system-organization.ts`) — jamais créée ni modifiée via
 * l'API tenant (voir `CreateDeliverableTemplateUseCase`/`CreateDocumentThemeUseCase`), disponible
 * en LECTURE SEULE par le résolveur pour toute organisation qui n'a rien configuré à aucun palier.
 * "Acheteur imposé" reste mappé sur TENDER + `note` libre (inchangé). La priorité RÉELLEMENT
 * utilisée est toujours explicitement conservée (`templateSourceLevel`/`themeSourceLevel` sur
 * `Deliverable`) — "aucune fusion silencieuse incohérente n'est autorisée" (mission §5).
 */
export const ScopeLevel = {
  Tender: "TENDER",
  Client: "CLIENT",
  Organization: "ORGANIZATION",
  TenderOS: "TENDEROS",
} as const;

export type ScopeLevel = (typeof ScopeLevel)[keyof typeof ScopeLevel];

/** Ordre de priorité de résolution — le premier niveau avec une version ACTIVE l'emporte. */
export const SCOPE_LEVEL_PRIORITY: readonly ScopeLevel[] = [ScopeLevel.Tender, ScopeLevel.Client, ScopeLevel.Organization, ScopeLevel.TenderOS];

export function isScopeLevel(value: string): value is ScopeLevel {
  return Object.values(ScopeLevel).includes(value as ScopeLevel);
}

/** Correctif audit Codex P1-004 — un acteur tenant (OWNER/ORGANIZATION_ADMIN inclus) ne peut
 *  jamais créer ni modifier une ressource TENDEROS via l'API : c'est une ressource système, gérée
 *  hors du périmètre applicatif tenant (seed/migration), jamais librement par une organisation. */
export function isTenantCreatableScopeLevel(value: ScopeLevel): boolean {
  return value !== ScopeLevel.TenderOS;
}
