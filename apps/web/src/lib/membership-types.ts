import type { BadgeTone } from "../components/ui/badge";

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

/** Checkpoint TENDEROS-2.1-P2.3-E7 (Team & Users V2) — remplace `membershipStatusBadgeClass`
 *  (classes brutes, supprimée) par le motif `BadgeTone` déjà établi (`deadlineBucketTone`,
 *  `temporalValidityTone`, `toneFor`) — consommé via `&lt;Badge tone={...}&gt;`. */
export function membershipStatusTone(status: MembershipStatus): BadgeTone {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "SUSPENDED":
      return "warning";
    case "REMOVED":
      return "neutral";
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
