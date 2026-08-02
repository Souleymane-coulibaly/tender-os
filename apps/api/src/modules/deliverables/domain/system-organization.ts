/**
 * Correctif audit Codex P1-004 — identifiant RÉSERVÉ représentant "TenderOS" comme ressource système
 * (jamais une organisation tenant réelle, jamais assignée à un utilisateur ni une session). Utilisé
 * UNIQUEMENT comme valeur d'`organizationId` pour les `DeliverableTemplate`/`DocumentTheme` de
 * palier `TENDEROS`.
 *
 * Vérifié : `deliverable_templates.organization_id`/`document_themes.organization_id` ne portent
 * AUCUNE contrainte FK vers `organizations` (dénormalisé, même motif que `pricingEstimateId` sur
 * `ExportSectionSelection`) — cette valeur n'a donc pas besoin d'une ligne `Organization` réelle
 * pour exister ; c'est un simple sentinel documenté, jamais généré aléatoirement.
 */
export const SYSTEM_ORGANIZATION_ID = "00000000-0000-0000-0000-00000005e57e";
