import { roleHasClientPortfolioPermission, type ClientPermission } from "../../../client-portfolio";
import { GenerationNotOwnedByActorError } from "../../domain/errors";
import type { Generation } from "../../domain/generation.aggregate";

/**
 * Correctif Sprint 6 (réaudit Codex P1 — "le rejet d'une génération est absent") — mirroir exact de
 * la "règle simple" de `generation-validate.policy.ts` : le rejet est l'autre issue possible de la
 * même revue que la validation, donc soumis à la même règle d'accès fine. `AssertClientAccessUseCase`
 * (avec `ClientPermission.ValidateGeneration`, réutilisée telle quelle — jamais une nouvelle
 * permission pour ce qui n'est qu'une seconde issue de la même capacité de revue) reste la porte
 * d'accès grossière commune ; CETTE fonction applique la seule restriction fine requise : un acteur
 * org-tier (OWNER/ORGANIZATION_ADMIN) peut rejeter n'importe quelle génération du client ; tout
 * acteur qui n'accède que via une affectation client (CLIENT_MANAGER comme CONTRIBUTOR, sans
 * distinction plus fine, même simplification volontaire que pour la validation) ne peut rejeter que
 * ses PROPRES générations, jamais celles d'un collègue.
 */
export function assertCanRejectGeneration(
  input: { actorId: string; actorRole: string; generation: Generation },
  rejectGenerationPermission: ClientPermission,
): void {
  if (roleHasClientPortfolioPermission(input.actorRole, rejectGenerationPermission)) {
    return;
  }
  if (input.generation.createdBy !== input.actorId) {
    throw new GenerationNotOwnedByActorError();
  }
}
