import { PlatformRole } from "./platform-role";

/**
 * Capacités plateforme — aucune documentation n'existe pour ce périmètre (module inédit).
 * Matrice proposée dans l'analyse préalable de cette mission, appliquant le moindre
 * privilège : SUPPORT reste en lecture seule, seuls ADMIN et OWNER peuvent suspendre/
 * réactiver une organisation.
 */
export const PlatformCapability = {
  OrganizationsRead: "platform:organizations:read",
  OrganizationsSuspend: "platform:organizations:suspend",
  OrganizationsReactivate: "platform:organizations:reactivate",
  UsersRead: "platform:users:read",
  AuditLogsRead: "platform:audit-logs:read",
  MetricsRead: "platform:metrics:read",
} as const;

export type PlatformCapability = (typeof PlatformCapability)[keyof typeof PlatformCapability];

export const ROLE_CAPABILITIES: Record<PlatformRole, readonly PlatformCapability[]> = {
  [PlatformRole.Owner]: Object.values(PlatformCapability),
  [PlatformRole.Admin]: Object.values(PlatformCapability),
  [PlatformRole.Support]: [
    PlatformCapability.OrganizationsRead,
    PlatformCapability.UsersRead,
    PlatformCapability.AuditLogsRead,
    PlatformCapability.MetricsRead,
  ],
};

export function roleHasCapability(role: PlatformRole, capability: PlatformCapability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}
