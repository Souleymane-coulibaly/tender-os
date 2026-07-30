import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission, roleHasClientPortfolioPermission } from "../../domain/client-permission";
import { CLIENT_ASSIGNMENT_REPOSITORY, type ClientAssignmentRepository } from "../ports/client-assignment.repository";

export type ListAccessibleClientsQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string }>;

/** `allClients: true` signifie "aucune restriction à appliquer" (OWNER/ADMIN, mission
 *  §"OWNER/ADMIN : accès à tous les clients") — `clientAccountIds` est alors vide et ne doit
 *  JAMAIS être utilisé comme une liste exhaustive dans ce cas. */
export type ListAccessibleClientsResult = Readonly<{ allClients: boolean; clientAccountIds: readonly string[] }>;

/**
 * Détermine l'ensemble des clients accessibles à un acteur (mission §"un utilisateur standard ne
 * voit que les clients auxquels il est affecté") — consommé par `ListClientAccountsUseCase` ainsi
 * que par les listes Tenders/Knowledge Base filtrées par client (mission §"filtrer les appels
 * d'offres par client", §"filtre client" Knowledge Base).
 */
@Injectable()
export class ListAccessibleClientsUseCase {
  constructor(@Inject(CLIENT_ASSIGNMENT_REPOSITORY) private readonly clientAssignmentRepository: ClientAssignmentRepository) {}

  async execute(query: ListAccessibleClientsQuery): Promise<ListAccessibleClientsResult> {
    if (roleHasClientPortfolioPermission(query.actorRole, ClientPermission.ViewAll)) {
      return { allClients: true, clientAccountIds: [] };
    }

    const clientAccountIds = await this.clientAssignmentRepository.listClientAccountIdsByUser({
      organizationId: query.organizationId,
      userId: query.actorId,
    });

    return { allClients: false, clientAccountIds };
  }
}
