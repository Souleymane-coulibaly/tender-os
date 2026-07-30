import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../domain/client-permission";
import { parseClientRole } from "../../domain/client-role";
import { ClientAccountNotFoundError, ClientAssignmentNotFoundError } from "../../domain/errors";
import { toClientAssignmentSummary, type ClientAssignmentSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CLIENT_ACCOUNT_REPOSITORY, type ClientAccountRepository } from "../ports/client-account.repository";
import { CLIENT_ASSIGNMENT_REPOSITORY, type ClientAssignmentRepository } from "../ports/client-assignment.repository";
import { AssertClientAccessUseCase } from "./assert-client-access.use-case";

export type UpdateClientAssignmentCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  assignmentId: string;
  actorId: string;
  actorRole: string;
  role: string;
  requestId?: string | undefined;
}>;

/** Changement de rôle client d'une affectation (mission §"Assigner un rôle client"). */
@Injectable()
export class UpdateClientAssignmentUseCase {
  constructor(
    @Inject(CLIENT_ACCOUNT_REPOSITORY) private readonly clientAccountRepository: ClientAccountRepository,
    @Inject(CLIENT_ASSIGNMENT_REPOSITORY) private readonly clientAssignmentRepository: ClientAssignmentRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: UpdateClientAssignmentCommand): Promise<ClientAssignmentSummary> {
    const client = await this.clientAccountRepository.findById(command);
    if (!client) {
      throw new ClientAccountNotFoundError();
    }

    await this.assertClientAccessUseCase.execute({ ...command, permission: ClientPermission.AssignUser });

    const assignment = await this.clientAssignmentRepository.findById(command);
    if (!assignment || assignment.clientAccountId !== command.clientAccountId) {
      throw new ClientAssignmentNotFoundError();
    }

    const role = parseClientRole(command.role);
    assignment.changeRole(role, this.clock.now());
    await this.clientAssignmentRepository.save(assignment);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "client_assignment.role_changed",
      resourceType: "client_assignment",
      resourceId: assignment.id,
      requestId: command.requestId,
      metadata: { clientAccountId: command.clientAccountId, role },
    });

    return toClientAssignmentSummary(assignment);
  }
}
