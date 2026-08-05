/**
 * Correctif audit Codex P1-005 — point d'extension pour la vérification d'accès à l'ENTITÉ CIBLE
 * d'une suggestion (Entreprise candidate/Opportunity/Tender/Document...), distincte de la
 * vérification organisation+rôle déjà en place (`AiSuggestionPermission`). Mission Sprint 1 §4 :
 * "prévoir les bases nécessaires aux futures vérifications... sans créer ces fonctionnalités dans
 * ce sprint" — ce port EST la base prévue ; son implémentation par défaut
 * (`NoopAiSuggestionTargetAccessPolicy`) n'ajoute aucune restriction au-delà de organisation+rôle
 * car aucun mapper métier (Sprint 4+) ne permet encore de résoudre le propriétaire réel d'une
 * entité cible. Un futur module (ex. Tenders pour `TENDER_LOT`) fournira sa propre implémentation
 * sur ce même token, sans qu'aucun use case de ce module générique n'ait besoin d'être modifié.
 */
export interface AiSuggestionTargetAccessPolicy {
  /** Lève une erreur métier si l'acteur ne doit pas accéder à l'entité cible de la suggestion. */
  assertCanAccessTarget(input: {
    organizationId: string;
    actorId: string;
    actorRole: string;
    entityType: string;
    entityId: string;
  }): Promise<void>;
}

export const AI_SUGGESTION_TARGET_ACCESS_POLICY = Symbol("AI_SUGGESTION_TARGET_ACCESS_POLICY");
