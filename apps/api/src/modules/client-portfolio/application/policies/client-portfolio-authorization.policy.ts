import { ClientPermissionMissingError } from "../../domain/errors";
import { roleHasClientPortfolioPermission, type ClientPermission } from "../../domain/client-permission";

/** Palier ORGANISATION uniquement (OWNER/ORGANIZATION_ADMIN) — voir `AssertClientAccessUseCase`
 *  pour le palier CLIENT (acteur atteignant un client précis via sa propre affectation). */
export function assertHasClientPortfolioPermission(role: string, permission: ClientPermission): void {
  if (!roleHasClientPortfolioPermission(role, permission)) {
    throw new ClientPermissionMissingError({ permission });
  }
}
