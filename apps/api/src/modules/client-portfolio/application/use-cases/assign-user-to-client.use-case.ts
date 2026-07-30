import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from "../../../memberships/application/ports/membership.repository";
import { ClientAssignment } from "../../domain/client-assignment.entity";
import { ClientPermission } from "../../domain/client-permission";
import { parseClientRole } from "../../domain/client-role";
import { ClientAccountNotFoundError, CrossOrganizationUserError, DuplicateClientAssignmentError } from "../../domain/errors";
import { toClientAssignmentSummary, type ClientAssignmentSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CLIENT_ACCOUNT_REPOSITORY, type ClientAccountRepository } from "../ports/client-account.repository";
import { CLIENT_ASSIGNMENT_REPOSITORY, type ClientAssignmentRepository } from "../ports/client-assignment.repository";
import { AssertClientAccessUseCase } from "./assert-client-access.use-case";

export type AssignUserToClientCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  actorId: string;
  actorRole: string;
  targetUserId: string;
  role: string;
  requestId?: string | undefined;
}>;

/** Affectation d'un utilisateur à un client (mission §"Assigner un utilisateur à un client") —
 *  refuse tout utilisateur n'appartenant pas à la même organisation (mission §"un utilisateur d'une
 *  organisation ne doit jamais accéder à un client d'une autre organisation", vérifié via
 *  `MembershipRepository`, jamais un `organizationId` fourni par le client) et tout doublon
 *  d'affectation (mission §"une seule ligne par (client, utilisateur)"). */
@Injectable()
export class AssignUserToClientUseCase {
  constructor(
    @Inject(CLIENT_ACCOUNT_REPOSITORY) private readonly clientAccountRepository: ClientAccountRepository,
    @Inject(CLIENT_ASSIGNMENT_REPOSITORY) private readonly clientAssignmentRepository: ClientAssignmentRepository,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: MembershipRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: AssignUserToClientCommand): Promise<ClientAssignmentSummary> {
    const client = await this.clientAccountRepository.findById(command);
    if (!client) {
      throw new ClientAccountNotFoundError();
    }

    await this.assertClientAccessUseCase.execute({ ...command, permission: ClientPermission.AssignUser });

    const targetMembership = await this.membershipRepository.findByOrganizationAndUser({
      organizationId: command.organizationId,
      userId: command.targetUserId,
    });
    if (!targetMembership) {
      throw new CrossOrganizationUserError();
    }

    const existing = await this.clientAssignmentRepository.findByClientAndUser({
      organizationId: command.organizationId,
      clientAccountId: command.clientAccountId,
      userId: command.targetUserId,
    });
    if (existing) {
      throw new DuplicateClientAssignmentError();
    }

    const role = parseClientRole(command.role);
    const assignment = ClientAssignment.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      clientAccountId: command.clientAccountId,
      userId: command.targetUserId,
      role,
      createdBy: command.actorId,
      occurredAt: this.clock.now(),
    });

    await this.clientAssignmentRepository.create(assignment);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "client_assignment.created",
      resourceType: "client_assignment",
      resourceId: assignment.id,
      requestId: command.requestId,
      metadata: { clientAccountId: command.clientAccountId, targetUserId: command.targetUserId, role },
    });

    return toClientAssignmentSummary(assignment);
  }
}
