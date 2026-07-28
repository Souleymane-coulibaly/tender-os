import type { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import type { OrganizationRole } from "../../domain/organization-role";

export type MembershipPage = {
  items: OrganizationMembership[];
  nextCursor: string | null;
};

/**
 * Vue de lecture/écriture scopée à une seule transaction Postgres protégée par un verrou
 * consultatif (BR-ORG-004, voir `runExclusiveForOrganization`) — jamais utilisée en dehors du
 * callback qui la reçoit : toute lecture ici reflète l'état réel au moment du verrou, jamais un
 * état lu avant son acquisition.
 */
export type OwnershipTransferContext = {
  findByOrganizationAndUser(input: {
    organizationId: string;
    userId: string;
  }): Promise<OrganizationMembership | null>;
  findById(input: { organizationId: string; membershipId: string }): Promise<OrganizationMembership | null>;
  save(input: { previousOwner: OrganizationMembership; newOwner: OrganizationMembership }): Promise<void>;
};

/**
 * `organization_memberships` est tenant-scoped : toute lecture d'une Membership précise
 * exige l'organizationId (skills/platform-foundation/DATABASE_PATTERNS.md §14 — jamais
 * `findById(membershipId)` seul).
 */
export interface MembershipRepository {
  findById(input: { organizationId: string; membershipId: string }): Promise<OrganizationMembership | null>;
  findByOrganizationAndUser(input: {
    organizationId: string;
    userId: string;
  }): Promise<OrganizationMembership | null>;
  listByOrganization(input: {
    organizationId: string;
    cursor?: string | undefined;
    limit: number;
  }): Promise<MembershipPage>;
  listByUser(input: { userId: string; cursor?: string | undefined; limit: number }): Promise<MembershipPage>;
  countActiveByOrganizationAndRole(input: { organizationId: string; role: OrganizationRole }): Promise<number>;
  countActiveByOrganization(organizationId: string): Promise<number>;
  save(membership: OrganizationMembership): Promise<void>;
  /**
   * BR-ORG-004 — exécute `fn` à l'intérieur d'une unique transaction Postgres protégée par un
   * verrou consultatif transactionnel (`pg_advisory_xact_lock`) scopé à `organizationId` — même
   * mécanisme déjà éprouvé pour la réorganisation des lots de Tender
   * (`PrismaTenderLotRepository.createAppendedAtEnd`). Sérialise tout transfert de propriété
   * concurrent pour cette organisation (les autres organisations ne sont jamais bloquées) et
   * garantit que les lectures faites via `context` reflètent l'état réel au moment du verrou —
   * jamais un état lu avant son ouverture. `fn` doit relire l'acteur courant via `context` (jamais
   * via une lecture antérieure à l'appel de cette méthode) avant de décider quoi que ce soit :
   * c'est cette relecture protégée par le verrou qui fait échouer proprement un second transfert
   * concurrent basé sur un état devenu obsolète, dès que le premier a commité.
   */
  runExclusiveForOrganization<T>(input: {
    organizationId: string;
    fn: (context: OwnershipTransferContext) => Promise<T>;
  }): Promise<T>;
}

export const MEMBERSHIP_REPOSITORY = Symbol("MEMBERSHIP_REPOSITORY");
