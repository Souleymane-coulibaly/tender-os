import { PermissionMissingError } from "../../domain/errors";
import { roleHasPermission } from "../../domain/organization-permission";
import type { OrganizationPermission } from "../../domain/organization-permission";
import type { OrganizationRole } from "../../domain/organization-role";

/**
 * Vérification de permission fine, appelée depuis le use case — jamais depuis le controller
 * ni entièrement depuis un guard (skills/platform-foundation/SECURITY_PATTERNS.md §6-8).
 */
export function assertHasPermission(role: OrganizationRole, permission: OrganizationPermission): void {
  if (!roleHasPermission(role, permission)) {
    throw new PermissionMissingError({ permission });
  }
}
