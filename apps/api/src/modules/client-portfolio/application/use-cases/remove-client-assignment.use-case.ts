import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../domain/client-permission";
import { ClientAccountNotFoundError, ClientAssignmentNotFoundError } from "../../domain/errors";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CLIENT_ACCOUNT_REPOSITORY, type ClientAccountRepository } from "../ports/client-account.repository";
import { CLIENT_ASSIGNMENT_REPOSITORY, type ClientAssignmentRepository } from "../ports/client-assignment.repository";
import { AssertClientAccessUseCase } from "./assert-client-access.use-case";

export type RemoveClientAssignmentCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  assignmentId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/** Retrait d'un utilisateur d'un client (mission §"Retirer un utilisateur d'un client") — un
 *  OWNER/ADMIN conserve toujours l'accès au client par son rôle d'organisation (mission
 *  §"OWNER/ADMIN : accès à tous les clients") : retirer le dernier CLIENT_MANAGER affecté n'est
 *  donc jamais un verrouillage complet, seulement une perte d'accès pour les rôles non-organisation
 *  — cette opération n'est volontairement pas bloquée. */
@Injectable()
export class RemoveClientAssignmentUseCase {
  constructor(
    @Inject(CLIENT_ACCOUNT_REPOSITORY) private readonly clientAccountRepository: ClientAccountRepository,
    @Inject(CLIENT_ASSIGNMENT_REPOSITORY) private readonly clientAssignmentRepository: ClientAssignmentRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: RemoveClientAssignmentCommand): Promise<void> {
    const client = await this.clientAccountRepository.findById(command);
    if (!client) {
      throw new ClientAccountNotFoundError();
    }

    await this.assertClientAccessUseCase.execute({ ...command, permission: ClientPermission.RemoveUser });

    const assignment = await this.clientAssignmentRepository.findById(command);
    if (!assignment || assignment.clientAccountId !== command.clientAccountId) {
      throw new ClientAssignmentNotFoundError();
    }

    await this.clientAssignmentRepository.delete(command);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "client_assignment.removed",
      resourceType: "client_assignment",
      resourceId: assignment.id,
      requestId: command.requestId,
      metadata: { clientAccountId: command.clientAccountId, targetUserId: assignment.userId },
    });
  }
}
