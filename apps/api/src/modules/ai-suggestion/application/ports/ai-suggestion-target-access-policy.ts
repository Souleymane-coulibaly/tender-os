/**
 * Correctif audit Codex P1-005 — point d'extension pour la vérification d'accès à l'ENTITÉ CIBLE
 * d'une suggestion (Entreprise candidate/Opportunity/Tender/Document...), distincte de la
 * vérification organisation+rôle déjà en place (`AiSuggestionPermission`). Mission Sprint 1 §4 :
 * "prévoir les bases nécessaires aux futures vérifications... sans créer ces fonctionnalités dans
 * ce sprint" — ce port EST la base prévue. V2 Sprint 4 : implémentation réelle fournie par
 * `ai-suggestion-bridge` (rebind du même token, jamais de modification de ce module générique) ;
 * la valeur par défaut (`NoopAiSuggestionTargetAccessPolicy`, instanciée en repli si aucun bridge
 * n'a rebindé le token — voir chaque use case) n'ajoute aucune restriction au-delà d'organisation
 * + rôle.
 */
export interface AiSuggestionTargetAccessPolicy {
  /** Lève une erreur métier si l'acteur ne doit pas accéder à l'entité cible de la suggestion. */
  assertCanAccessTarget(input: {
    organizationId: string;
    actorId: string;
    actorRole: string;
    entityType: string;
    entityId: string | undefined;
    parentTenderId: string;
    parentLotId: string | undefined;
  }): Promise<void>;
}

export const AI_SUGGESTION_TARGET_ACCESS_POLICY = Symbol("AI_SUGGESTION_TARGET_ACCESS_POLICY");
