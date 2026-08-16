/**
 * Consolidation IA — Checkpoint A (Foundation). Source UNIQUE du modèle IA par défaut de la
 * plateforme : jusqu'ici dupliquée indépendamment dans `analysis-config.ts`, `generation-config.ts`,
 * `chat-config.ts` et `technical-memo-ai-config.ts` (même valeur littérale répétée 4 fois, aucune
 * source commune). Valeur inchangée — ce fichier ne change AUCUN comportement, seulement sa
 * provenance. `shared-kernel` est le foyer déjà établi des primitives universelles (`Clock`,
 * `IdGenerator`, `EmailProvider`) : les 4 modules IA n'ont aujourd'hui aucune dépendance directe
 * vers `ai-benchmark` (seulement via les tokens DI de `RoutingPolicyBridgeModule`), donc importer
 * depuis `shared-kernel` n'introduit aucun couplage nouveau.
 */
export const DEFAULT_AI_MODEL = "gpt-4o-mini";
