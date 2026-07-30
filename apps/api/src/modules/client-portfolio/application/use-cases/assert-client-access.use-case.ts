import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission, clientRoleHasActionPermission, roleHasClientPortfolioPermission } from "../../domain/client-permission";
import { ClientAccountNotFoundError, ClientPermissionMissingError } from "../../domain/errors";
import { CLIENT_ASSIGNMENT_REPOSITORY, type ClientAssignmentRepository } from "../ports/client-assignment.repository";

export type AssertClientAccessQuery = Readonly<{
  organizationId: string;
  clientAccountId: string;
  actorId: string;
  actorRole: string;
  permission: ClientPermission;
}>;

/**
 * Policy d'accès client CENTRALISÉE (mission Sprint 5.1 §"Policy d'accès client centralisée") —
 * point d'application UNIQUE de la règle : un acteur accède à une ressource d'un client si le
 * client appartient à son organisation ET (il est OWNER/ADMIN OU il a une affectation active sur
 * ce client ET son rôle client autorise l'action). Jamais recopiée dans un contrôleur — Tenders,
 * Documents, Analysis et Knowledge Base l'appellent tous via ce seul use case (mission
 * §"réutilisable par Tenders/Documents/Analysis/Knowledge Base/Dashboard/futures fonctionnalités").
 *
 * Convention 404-jamais-403 pour un acteur SANS AUCUNE affectation (même motif que
 * `OrganizationMembershipGuard` pour l'appartenance à l'organisation) : ne jamais révéler
 * l'existence d'un client à un acteur qui n'y a structurellement aucun accès. Un acteur qui A une
 * affectation mais dont le rôle client est insuffisant pour l'action précise reçoit en revanche un
 * 403 explicite (`ClientPermissionMissingError`) — il sait déjà que le client existe.
 */
@Injectable()
export class AssertClientAccessUseCase {
  constructor(@Inject(CLIENT_ASSIGNMENT_REPOSITORY) private readonly clientAssignmentRepository: ClientAssignmentRepository) {}

  async execute(query: AssertClientAccessQuery): Promise<void> {
    if (roleHasClientPortfolioPermission(query.actorRole, query.permission)) {
      return;
    }

    const assignment = await this.clientAssignmentRepository.findByClientAndUser({
      organizationId: query.organizationId,
      clientAccountId: query.clientAccountId,
      userId: query.actorId,
    });

    if (!assignment) {
      throw new ClientAccountNotFoundError();
    }

    if (!clientRoleHasActionPermission(assignment.role, query.permission)) {
      throw new ClientPermissionMissingError({ permission: query.permission });
    }
  }
}
