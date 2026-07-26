import { MembershipNotActiveError } from "./errors";
import { MembershipId } from "./membership-id.value-object";
import { MembershipStatus } from "./membership-status";
import type { OrganizationRole } from "./organization-role";

export type OrganizationMembershipProps = {
  id: MembershipId;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: MembershipStatus;
  joinedAt?: Date | undefined;
  suspendedAt?: Date | undefined;
  expiresAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Relie un utilisateur (Identity) à une organisation (Organizations) — référencés
 * uniquement par id, jamais par leurs types Domain respectifs (frontière de module,
 * skills/platform-foundation/ARCHITECTURE_RULES.md §6.2).
 *
 * Ne porte volontairement qu'un seul rôle actif à la fois dans cette tranche : la table
 * `membership_roles` reste générique (docs/04-architecture/DATABASE_DESIGN.md §6.4) mais
 * aucun besoin documenté ne justifie plusieurs rôles simultanés pour une Membership.
 */
export class OrganizationMembership {
  private constructor(private props: OrganizationMembershipProps) {}

  static create(input: {
    id: MembershipId;
    organizationId: string;
    userId: string;
    role: OrganizationRole;
    expiresAt?: Date | undefined;
    occurredAt: Date;
  }): OrganizationMembership {
    return new OrganizationMembership({
      id: input.id,
      organizationId: input.organizationId,
      userId: input.userId,
      role: input.role,
      status: MembershipStatus.Active,
      joinedAt: input.occurredAt,
      suspendedAt: undefined,
      expiresAt: input.expiresAt,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: OrganizationMembershipProps): OrganizationMembership {
    return new OrganizationMembership(props);
  }

  /**
   * Le contrôle "dernier Organization Admin" (BR-ORG-002) porte sur l'ensemble des Memberships
   * d'une organisation : il reste une responsabilité applicative, pas un invariant de cet agrégat seul.
   */
  changeRole(role: OrganizationRole, occurredAt: Date): void {
    this.assertActive();
    this.props.role = role;
    this.props.updatedAt = occurredAt;
  }

  suspend(occurredAt: Date): void {
    this.assertActive();
    this.props.status = MembershipStatus.Suspended;
    this.props.suspendedAt = occurredAt;
    this.props.updatedAt = occurredAt;
  }

  remove(occurredAt: Date): void {
    if (this.props.status === MembershipStatus.Removed) {
      throw new MembershipNotActiveError({ status: this.props.status });
    }
    this.props.status = MembershipStatus.Removed;
    this.props.updatedAt = occurredAt;
  }

  private assertActive(): void {
    if (this.props.status !== MembershipStatus.Active) {
      throw new MembershipNotActiveError({ status: this.props.status });
    }
  }

  /**
   * Prend en compte l'expiration à la lecture (bible/03-domain/permissions.md §22) —
   * aucun job planifié ne fait transiter le statut vers EXPIRED dans cette tranche.
   */
  isEffectivelyActive(at: Date): boolean {
    if (this.props.status !== MembershipStatus.Active) {
      return false;
    }
    return this.props.expiresAt === undefined || this.props.expiresAt.getTime() > at.getTime();
  }

  get id(): MembershipId {
    return this.props.id;
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get role(): OrganizationRole {
    return this.props.role;
  }

  get status(): MembershipStatus {
    return this.props.status;
  }

  get joinedAt(): Date | undefined {
    return this.props.joinedAt;
  }

  get suspendedAt(): Date | undefined {
    return this.props.suspendedAt;
  }

  get expiresAt(): Date | undefined {
    return this.props.expiresAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
