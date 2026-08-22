export type PageResponse<T> = { items: readonly T[]; pageInfo: { hasNextPage: boolean; nextCursor: string | null } };

/** Mirroir de `apps/api/.../memberships/domain/organization-role.ts` — jamais une seconde
 *  nomenclature : les 8 valeurs exactes acceptées par le backend. */
export const ORGANIZATION_ROLES = ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER", "CONTRIBUTOR", "REVIEWER", "EXECUTIVE", "EXTERNAL_CONSULTANT", "READ_ONLY"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const ORGANIZATION_ROLE_LABELS: Record<OrganizationRole, string> = {
  OWNER: "Propriétaire",
  ORGANIZATION_ADMIN: "Administrateur",
  BID_MANAGER: "Responsable AO",
  CONTRIBUTOR: "Contributeur",
  REVIEWER: "Relecteur",
  EXECUTIVE: "Direction",
  EXTERNAL_CONSULTANT: "Consultant externe",
  READ_ONLY: "Lecture seule",
};

/** Rôles assignables via un changement de rôle ORDINAIRE — OWNER en est exclu (le backend refuse
 *  `OwnershipRequiresTransferError`, mission "seul le transfert explicite peut faire porter/quitter
 *  ce rôle"), jamais dupliqué ici autrement qu'en excluant l'option de la liste. */
export const ASSIGNABLE_ROLES = ORGANIZATION_ROLES.filter((role) => role !== "OWNER");

export type MembershipStatus = "ACTIVE" | "SUSPENDED" | "REMOVED";

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  REMOVED: "Retiré",
};

export function membershipStatusBadgeClass(status: MembershipStatus): string {
  switch (status) {
    case "ACTIVE":
      return "bg-green-100 text-green-800";
    case "SUSPENDED":
      return "bg-amber-100 text-amber-800";
    case "REMOVED":
      return "bg-neutral-200 text-neutral-600";
  }
}

export type OrganizationMemberResponse = {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: MembershipStatus;
  joinedAt: string;
  suspendedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; email: string; displayName: string };
};
