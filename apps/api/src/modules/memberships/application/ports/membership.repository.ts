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
  /** Correctif audit Codex 22E (P2) — filtre par rôle AU NIVEAU REQUÊTE, jamais une pagination
   *  générique de tous les membres suivie d'un filtre applicatif (`listByOrganization` paginée
   *  aurait pu exclure silencieusement un OWNER/ORGANIZATION_ADMIN ajouté après les N premiers
   *  membres d'une grande organisation). Le statut ACTIVE est filtré en base ; `expiresAt` reste
   *  vérifié par l'appelant via `isEffectivelyActive` (dépend de "maintenant", jamais figé en
   *  requête). Le nombre d'OWNER/ORGANIZATION_ADMIN d'une organisation reste toujours restreint
   *  par construction (mission — un seul OWNER actif à la fois, BR-ORG-002), jamais un besoin de
   *  pagination ici. */
  listActiveByOrganizationAndRoles(input: { organizationId: string; roles: readonly OrganizationRole[] }): Promise<OrganizationMembership[]>;
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
  /**
   * Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 3 — corrige la course "compter les membres actifs
   * PUIS sauvegarder", identifiée sans verrou ni transaction dans `CreateMembershipUseCase` : deux
   * requêtes concurrentes pouvaient chacune lire le même compte AVANT que l'une des deux n'insère,
   * dépassant `seatLimit`. Même mécanisme que `runExclusiveForOrganization` ci-dessus
   * (`pg_advisory_xact_lock` scopé à `organizationId`, BR-ORG-004) : comptage ET insertion dans UNE
   * SEULE transaction protégée par le même verrou — jamais un mutex en mémoire (ne survivrait pas à
   * plusieurs instances API), jamais un flag frontend, jamais un double-check non transactionnel.
   * Retourne `applied: false` (aucune écriture) si `activeCount >= seatLimit` au moment du verrou,
   * jamais après une insertion optimiste suivie d'un rollback applicatif.
   */
  saveWithSeatLimit(input: {
    organizationId: string;
    membership: OrganizationMembership;
    seatLimit: number | "UNLIMITED";
  }): Promise<{ applied: boolean; activeCount: number }>;
  /**
   * Checkpoint TENDEROS-2.1-P2.3-E2 (Onboarding V2, audit Codex — correctif du P1 "création
   * Organization non atomique/non idempotente sous concurrence réelle") — même mécanisme
   * (`pg_advisory_xact_lock`, BR-ORG-004) que `runExclusiveForOrganization`/`saveWithSeatLimit`,
   * mais scopé à `actorId` plutôt qu'à `organizationId` : au moment du bootstrap "créer mon
   * organisation", AUCUNE organisation n'existe encore sur laquelle verrouiller — le verrou doit
   * porter sur l'ACTEUR pour sérialiser deux appels concurrents du MÊME utilisateur (double
   * submit/retry réseau), jamais les autres utilisateurs. `fn` s'exécute sous
   * `TransactionalContext` (voir `PrismaAtomicTransactionRunner`) : tout repository qui lit via
   * `PrismaService.currentClient()` (dans N'IMPORTE QUEL module, ex. `PrismaOrganizationRepository`)
   * rejoint automatiquement cette même transaction, sans faire fuiter `tx` à travers la frontière
   * de module.
   */
  runExclusiveForActor<T>(input: { actorId: string; fn: () => Promise<T> }): Promise<T>;
}

export const MEMBERSHIP_REPOSITORY = Symbol("MEMBERSHIP_REPOSITORY");
