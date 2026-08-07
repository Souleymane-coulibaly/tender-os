import { OpportunityPermissionMissingError } from "../../domain/errors";
import { roleHasOpportunityPermission, type OpportunityPermission } from "../../domain/opportunity-permission";

export function assertHasOpportunityPermission(role: string, permission: OpportunityPermission): void {
  if (!roleHasOpportunityPermission(role, permission)) {
    throw new OpportunityPermissionMissingError({ permission });
  }
}
