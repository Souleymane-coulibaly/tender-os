import { KnowledgePermissionMissingError } from "../../domain/errors";
import { roleHasKnowledgePermission, type KnowledgePermission } from "../../domain/knowledge-permission";

export function assertHasKnowledgePermission(role: string, permission: KnowledgePermission): void {
  if (!roleHasKnowledgePermission(role, permission)) {
    throw new KnowledgePermissionMissingError({ permission });
  }
}
