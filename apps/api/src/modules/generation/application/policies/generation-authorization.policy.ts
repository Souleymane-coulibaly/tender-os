import { GenerationPermissionMissingError } from "../../domain/errors";
import { roleHasGenerationPermission, type GenerationPermission } from "../../domain/generation-permission";

/** Garde uniquement les capacités ORG-WIDE de Prompt Management (voir `generation-permission.ts`) —
 *  les actions de génération elles-mêmes passent par `AssertClientAccessUseCase` (client-portfolio),
 *  jamais par cette fonction. */
export function assertHasGenerationPermission(role: string, permission: GenerationPermission): void {
  if (!roleHasGenerationPermission(role, permission)) {
    throw new GenerationPermissionMissingError({ permission });
  }
}
