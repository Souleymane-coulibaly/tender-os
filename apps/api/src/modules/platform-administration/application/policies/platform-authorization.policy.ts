import { PlatformCapabilityMissingError } from "../../domain/errors";
import { roleHasCapability, type PlatformCapability } from "../../domain/platform-capability";
import type { PlatformRole } from "../../domain/platform-role";

export function assertHasCapability(role: PlatformRole, capability: PlatformCapability): void {
  if (!roleHasCapability(role, capability)) {
    throw new PlatformCapabilityMissingError({ capability });
  }
}
