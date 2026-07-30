import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { ClientAccountDetailsUpdate } from "../../domain/client-account.aggregate";
import { ClientPermission } from "../../domain/client-permission";
import { ClientAccountNotFoundError, DuplicateClientAccountNameError } from "../../domain/errors";
import { normalizeClientAccountName } from "../../domain/client-name-normalizer";
import { toClientAccountSummary, type ClientAccountSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CLIENT_ACCOUNT_REPOSITORY, type ClientAccountRepository } from "../ports/client-account.repository";
import { AssertClientAccessUseCase } from "./assert-client-access.use-case";

export type UpdateClientAccountCommand = Readonly<
  { organizationId: string; clientAccountId: string; actorId: string; actorRole: string; requestId?: string | undefined } & ClientAccountDetailsUpdate
>;

@Injectable()
export class UpdateClientAccountUseCase {
  constructor(
    @Inject(CLIENT_ACCOUNT_REPOSITORY) private readonly clientAccountRepository: ClientAccountRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: UpdateClientAccountCommand): Promise<ClientAccountSummary> {
    const client = await this.clientAccountRepository.findById(command);
    if (!client) {
      throw new ClientAccountNotFoundError();
    }

    await this.assertClientAccessUseCase.execute({ ...command, permission: ClientPermission.Update });

    if (command.name !== undefined) {
      const nameNormalized = normalizeClientAccountName(command.name);
      const existing = await this.clientAccountRepository.findByNormalizedName({ organizationId: command.organizationId, nameNormalized });
      if (existing && existing.id !== client.id) {
        throw new DuplicateClientAccountNameError();
      }
    }

    client.updateDetails(
      {
        name: command.name,
        legalName: command.legalName,
        reference: command.reference,
        sector: command.sector,
        country: command.country,
        address: command.address,
        website: command.website,
        notes: command.notes,
      },
      command.actorId,
      this.clock.now(),
    );

    await this.clientAccountRepository.save(client);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "client_account.updated",
      resourceType: "client_account",
      resourceId: client.id,
      requestId: command.requestId,
    });

    return toClientAccountSummary(client);
  }
}
