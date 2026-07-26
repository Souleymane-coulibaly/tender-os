import { TenderPermissionMissingError } from "../../domain/errors";
import { roleHasTenderPermission, type TenderPermission } from "../../domain/tender-permission";

export function assertHasTenderPermission(role: string, permission: TenderPermission): void {
  if (!roleHasTenderPermission(role, permission)) {
    throw new TenderPermissionMissingError({ permission });
  }
}
