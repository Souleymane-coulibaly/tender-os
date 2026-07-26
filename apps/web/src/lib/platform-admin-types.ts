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
