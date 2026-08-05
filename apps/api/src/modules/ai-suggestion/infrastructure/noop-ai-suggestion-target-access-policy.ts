import { Injectable } from "@nestjs/common";
import type { AiSuggestionTargetAccessPolicy } from "../application/ports/ai-suggestion-target-access-policy";

/** Câblée par défaut en Sprint 1 (voir la documentation du port) — remplacée/étendue par un futur
 *  module producteur, jamais en modifiant ce module générique. */
@Injectable()
export class NoopAiSuggestionTargetAccessPolicy implements AiSuggestionTargetAccessPolicy {
  async assertCanAccessTarget(): Promise<void> {
    return Promise.resolve();
  }
}
