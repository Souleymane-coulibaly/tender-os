import { AiBenchmarkPermissionMissingError } from "../../domain/errors";
import { roleHasAiBenchmarkPermission, type AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";

export function assertHasAiBenchmarkPermission(role: string, permission: AiBenchmarkPermission): void {
  if (!roleHasAiBenchmarkPermission(role, permission)) {
    throw new AiBenchmarkPermissionMissingError({ permission });
  }
}
