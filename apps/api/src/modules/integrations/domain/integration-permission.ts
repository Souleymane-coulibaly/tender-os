import { DomainError } from "../../../shared-kernel/domain-error";

/**
 * Permissions du module integrations (mission §59-61) — même motif "table binaire" que
 * `ai-benchmark-permission.ts` : OWNER/ORGANIZATION_ADMIN seuls reçoivent une capacité, TOUS les
 * autres rôles (y compris BID_MANAGER/CONTRIBUTOR) n'ont AUCUN accès, même en lecture — mission
 * §61 "un CONTRIBUTOR standard ne doit pas nécessairement pouvoir envoyer les données TenderOS
 * vers une URL externe" ; l'existence même d'un webhook/d'une clé API est une information
 * organisationnelle sensible (mission §16 "Impossible d'accéder à une autre organisation"), pas
 * seulement sa création.
 */
export const IntegrationPermission = {
  Read: "INTEGRATIONS_READ",
  Manage: "INTEGRATIONS_MANAGE",
  ApiKeysManage: "API_KEYS_MANAGE",
  WebhooksManage: "WEBHOOKS_MANAGE",
} as const;

export type IntegrationPermission = (typeof IntegrationPermission)[keyof typeof IntegrationPermission];

const ALL_PERMISSIONS: readonly IntegrationPermission[] = Object.values(IntegrationPermission);

export const ROLE_INTEGRATION_PERMISSIONS: Record<string, readonly IntegrationPermission[]> = {
  OWNER: ALL_PERMISSIONS,
  ORGANIZATION_ADMIN: ALL_PERMISSIONS,
  BID_MANAGER: [],
  CONTRIBUTOR: [],
  REVIEWER: [],
  EXECUTIVE: [],
  EXTERNAL_CONSULTANT: [],
  READ_ONLY: [],
};

export function roleHasIntegrationPermission(role: string, permission: IntegrationPermission): boolean {
  return (ROLE_INTEGRATION_PERMISSIONS[role] ?? []).includes(permission);
}

export function assertHasIntegrationPermission(role: string, permission: IntegrationPermission): void {
  if (!roleHasIntegrationPermission(role, permission)) {
    throw new IntegrationPermissionMissingError();
  }
}

export class IntegrationPermissionMissingError extends DomainError {
  readonly code = "INTEGRATION_PERMISSION_MISSING";
  constructor() {
    super("You do not have permission to manage integrations for this organization.");
  }
}
