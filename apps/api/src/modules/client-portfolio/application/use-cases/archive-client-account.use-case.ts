import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../domain/client-permission";
import { ClientAccountNotFoundError } from "../../domain/errors";
import { toClientAccountSummary, type ClientAccountSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CLIENT_ACCOUNT_REPOSITORY, type ClientAccountRepository } from "../ports/client-account.repository";
import { AssertClientAccessUseCase } from "./assert-client-access.use-case";

export type ArchiveClientAccountCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/** Idempotent (domaine, `ClientAccount.archive()`) — archiver un client déjà archivé n'échoue
 *  jamais et ne réécrit pas `archivedAt`. */
@Injectable()
export class ArchiveClientAccountUseCase {
  constructor(
    @Inject(CLIENT_ACCOUNT_REPOSITORY) private readonly clientAccountRepository: ClientAccountRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: ArchiveClientAccountCommand): Promise<ClientAccountSummary> {
    const client = await this.clientAccountRepository.findById(command);
    if (!client) {
      throw new ClientAccountNotFoundError();
    }

    await this.assertClientAccessUseCase.execute({ ...command, permission: ClientPermission.Archive });

    client.archive(this.clock.now());
    await this.clientAccountRepository.save(client);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "client_account.archived",
      resourceType: "client_account",
      resourceId: client.id,
      requestId: command.requestId,
    });

    return toClientAccountSummary(client);
  }
}
