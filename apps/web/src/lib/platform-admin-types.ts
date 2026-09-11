export type PageResponse<T> = {
  items: T[];
  pageInfo: { hasNextPage: boolean; nextCursor: string | null };
};

export type PlatformOrganization = {
  id: string;
  name: string;
  slug: string;
  status: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  activeMemberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PlatformUser = {
  id: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  createdAt: string;
};

export type PlatformAuditLogEntry = {
  id: string;
  organizationId: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: string;
  createdAt: string;
};

export type PlatformMetrics = {
  organizationsByStatus: Record<string, number>;
  usersByStatus: Record<string, number>;
  platformAdministratorsByRole: Record<string, number>;
};

/** Statut d'une organisation. */
export const ORGANIZATION_STATUS_LABELS: Record<string, string> = {
  TRIAL: "Essai",
  ACTIVE: "Active",
  SUSPENDED: "Suspendue",
  CLOSED: "Fermée",
};

/** Résultat d'une action journalisée — un résultat inconnu s'affiche tel quel, jamais masqué. */
export const PLATFORM_AUDIT_RESULT_LABELS: Record<string, string> = {
  SUCCESS: "Réussi",
  FAILURE: "Échec",
  DENIED: "Refusé",
};
