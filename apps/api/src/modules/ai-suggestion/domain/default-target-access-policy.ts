import type { AiSuggestionTargetAccessPolicy } from "../application/ports/ai-suggestion-target-access-policy";

/**
 * V2 Sprint 4 — repli utilisé par chaque use case lorsqu'aucun module producteur n'a rebindé
 * `AI_SUGGESTION_TARGET_ACCESS_POLICY` (voir ai-suggestion.module.ts, injection `@Optional()`).
 * Vit dans le Domain (aucune dépendance) plutôt que dans Infrastructure, pour ne jamais faire
 * dépendre l'Application d'Infrastructure — même règle de couches que partout ailleurs dans ce
 * module. N'ajoute aucune restriction au-delà d'organisation + rôle déjà vérifiés séparément.
 */
export const DEFAULT_TARGET_ACCESS_POLICY: AiSuggestionTargetAccessPolicy = {
  async assertCanAccessTarget(): Promise<void> {
    return Promise.resolve();
  },
};
