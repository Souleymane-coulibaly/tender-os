import { AnalysisPermissionMissingError } from "../../domain/errors";
import { roleHasAnalysisPermission, type AnalysisPermission } from "../../domain/analysis-permission";

export function assertHasAnalysisPermission(role: string, permission: AnalysisPermission): void {
  if (!roleHasAnalysisPermission(role, permission)) {
    throw new AnalysisPermissionMissingError({ permission });
  }
}
