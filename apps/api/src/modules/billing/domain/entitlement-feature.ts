/**
 * V2 Sprint 22 (billing, étape 22A) — mission §4/§13 : uniquement les fonctionnalités DIFFÉRENCIATES
 * entre paliers. Le "cœur métier" (DCE, analyse IA, checklist, mémoire technique, chiffrage, dossier
 * administratif, package de réponse) est disponible sur TOUS les paliers payants (Pass inclus, dès
 * lors qu'un Pass est actif — mission §3 "fonctionnalités métier Starter") : ce socle n'a donc
 * délibérément pas d'entrée ici (une fonctionnalité toujours vraie n'a rien à gater, CLAUDE.md
 * "ne jamais créer de complexité inutile"). N'ajouter une valeur ici QUE si au moins un palier ne
 * l'a pas.
 */
export const EntitlementFeature = {
  AdvancedCollaboration: "ADVANCED_COLLABORATION",
  ApprovalWorkflows: "APPROVAL_WORKFLOWS",
  PublicApi: "PUBLIC_API",
  Webhooks: "WEBHOOKS",
  AutomationConnectors: "AUTOMATION_CONNECTORS",
} as const;

export type EntitlementFeature = (typeof EntitlementFeature)[keyof typeof EntitlementFeature];

export function isEntitlementFeature(value: string): value is EntitlementFeature {
  return Object.values(EntitlementFeature).includes(value as EntitlementFeature);
}
