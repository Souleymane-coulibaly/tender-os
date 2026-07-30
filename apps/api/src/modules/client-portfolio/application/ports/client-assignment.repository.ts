import type { ClientAssignment } from "../../domain/client-assignment.entity";

export interface ClientAssignmentRepository {
  findById(input: { organizationId: string; assignmentId: string }): Promise<ClientAssignment | null>;
  findByClientAndUser(input: { organizationId: string; clientAccountId: string; userId: string }): Promise<ClientAssignment | null>;
  create(assignment: ClientAssignment): Promise<void>;
  save(assignment: ClientAssignment): Promise<void>;
  delete(input: { organizationId: string; assignmentId: string }): Promise<void>;
  listByClient(input: { organizationId: string; clientAccountId: string }): Promise<readonly ClientAssignment[]>;
  /** Mission §"un utilisateur standard ne voit que les clients auxquels il est affecté" — tous les
   *  identifiants de client sur lesquels cet utilisateur a une affectation active, dans cette
   *  organisation (utilisé par `ListAccessibleClientsUseCase`, jamais un chargement complet de tous
   *  les clients pour filtrer en mémoire, mission §"Performance"). */
  listClientAccountIdsByUser(input: { organizationId: string; userId: string }): Promise<readonly string[]>;
}

export const CLIENT_ASSIGNMENT_REPOSITORY = Symbol("CLIENT_ASSIGNMENT_REPOSITORY");
