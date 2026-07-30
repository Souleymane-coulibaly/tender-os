import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../domain/client-permission";
import { ClientAccountNotFoundError } from "../../domain/errors";
import { toClientAccountSummary, type ClientAccountSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CLIENT_ACCOUNT_REPOSITORY, type ClientAccountRepository } from "../ports/client-account.repository";
import { AssertClientAccessUseCase } from "./assert-client-access.use-case";

export type RestoreClientAccountCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/** Idempotent (domaine, `ClientAccount.restore()`) — restaurer un client déjà actif n'échoue
 *  jamais. */
@Injectable()
export class RestoreClientAccountUseCase {
  constructor(
    @Inject(CLIENT_ACCOUNT_REPOSITORY) private readonly clientAccountRepository: ClientAccountRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: RestoreClientAccountCommand): Promise<ClientAccountSummary> {
    const client = await this.clientAccountRepository.findById(command);
    if (!client) {
      throw new ClientAccountNotFoundError();
    }

    await this.assertClientAccessUseCase.execute({ ...command, permission: ClientPermission.Restore });

    client.restore(this.clock.now());
    await this.clientAccountRepository.save(client);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "client_account.restored",
      resourceType: "client_account",
      resourceId: client.id,
      requestId: command.requestId,
    });

    return toClientAccountSummary(client);
  }
}
