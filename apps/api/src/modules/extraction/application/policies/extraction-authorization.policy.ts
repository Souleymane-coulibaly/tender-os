import { ExtractionPermissionMissingError } from "../../domain/extraction-errors";
import { roleHasExtractionPermission, type ExtractionPermission } from "../../domain/extraction-permission";

export function assertHasExtractionPermission(role: string, permission: ExtractionPermission): void {
  if (!roleHasExtractionPermission(role, permission)) {
    throw new ExtractionPermissionMissingError({ permission });
  }
}
