import { DocumentPermissionMissingError } from "../../domain/errors";
import { roleHasDocumentPermission, type DocumentPermission } from "../../domain/document-permission";

export function assertHasDocumentPermission(role: string, permission: DocumentPermission): void {
  if (!roleHasDocumentPermission(role, permission)) {
    throw new DocumentPermissionMissingError({ permission });
  }
}
