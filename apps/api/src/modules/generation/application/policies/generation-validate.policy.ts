import { roleHasClientPortfolioPermission, type ClientPermission } from "../../../client-portfolio";
import { GenerationNotOwnedByActorError } from "../../domain/errors";
import type { Generation } from "../../domain/generation.aggregate";

/**
 * "Règle simple" de validation (mission Sprint 6 §"Validation" — "MEMBER autorisé selon le
 * périmètre... Selon règle simple", "ne développe pas encore un workflow multi-niveaux du Sprint
 * 12"). `AssertClientAccessUseCase` (avec `ClientPermission.ValidateGeneration`) reste la porte
 * d'accès grossière commune à tout le module ; CETTE fonction applique la seule restriction fine
 * requise : un acteur org-tier (OWNER/ORGANIZATION_ADMIN, `roleHasClientPortfolioPermission`
 * retourne déjà `true` pour eux) peut valider n'importe quelle génération du client ; tout acteur
 * qui n'accède que via une affectation client (CLIENT_MANAGER comme CONTRIBUTOR, sans distinction
 * plus fine dans cette tranche — simplification volontaire, voir rapport final §I) ne peut valider
 * que ses PROPRES générations (`generation.createdBy === actorId`), jamais celles d'un collègue.
 */
export function assertCanValidateGeneration(
  input: { actorId: string; actorRole: string; generation: Generation },
  validateGenerationPermission: ClientPermission,
): void {
  if (roleHasClientPortfolioPermission(input.actorRole, validateGenerationPermission)) {
    return;
  }
  if (input.generation.createdBy !== input.actorId) {
    throw new GenerationNotOwnedByActorError();
  }
}
