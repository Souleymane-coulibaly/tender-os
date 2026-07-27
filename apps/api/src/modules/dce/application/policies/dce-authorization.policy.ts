import { DcePermissionMissingError } from "../../domain/errors";
import { roleHasDcePermission, type DcePermission } from "../../domain/dce-permission";

export function assertHasDcePermission(role: string, permission: DcePermission): void {
  if (!roleHasDcePermission(role, permission)) {
    throw new DcePermissionMissingError({ permission });
  }
}
