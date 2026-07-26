import type { Prisma } from "@prisma/client";
import { MembershipId } from "../domain/membership-id.value-object";
import type { MembershipStatus } from "../domain/membership-status";
import { OrganizationMembership } from "../domain/organization-membership.aggregate";
import type { OrganizationRole } from "../domain/organization-role";

export type MembershipRecordWithRole = Prisma.OrganizationMembershipGetPayload<{
  include: { roles: { include: { role: true } } };
}>;

export type MembershipPersistenceData = {
  id: string;
  organizationId: string;
  userId: string;
  status: string;
  joinedAt: Date | null;
  suspendedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Traduit entre le modèle Prisma (Infrastructure) et l'agrégat Domain — Prisma ne
 * traverse jamais cette frontière (skills/platform-foundation/ARCHITECTURE_RULES.md §17.2).
 * Le rôle vit dans la table de jonction `membership_roles` : le mapper reçoit le code déjà
 * résolu par le repository plutôt que d'interroger Prisma lui-même (§18 — un mapper doit
 * rester déterministe, sans dépendance externe).
 */
export class OrganizationMembershipPersistenceMapper {
  toDomain(record: MembershipRecordWithRole): OrganizationMembership {
    const roleCode = record.roles[0]?.role.code;

    if (!roleCode) {
      throw new Error(`OrganizationMembership ${record.id} has no assigned role — data integrity issue.`);
    }

    return OrganizationMembership.rehydrate({
      id: MembershipId.from(record.id),
      organizationId: record.organizationId,
      userId: record.userId,
      role: roleCode as OrganizationRole,
      status: record.status as MembershipStatus,
      joinedAt: record.joinedAt ?? undefined,
      suspendedAt: record.suspendedAt ?? undefined,
      expiresAt: record.expiresAt ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  toPersistence(membership: OrganizationMembership): MembershipPersistenceData {
    return {
      id: membership.id.value,
      organizationId: membership.organizationId,
      userId: membership.userId,
      status: membership.status,
      joinedAt: membership.joinedAt ?? null,
      suspendedAt: membership.suspendedAt ?? null,
      expiresAt: membership.expiresAt ?? null,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
    };
  }
}
