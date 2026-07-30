import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../domain/client-permission";
import { ClientAccountNotFoundError } from "../../domain/errors";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CLIENT_ACCOUNT_REPOSITORY, type ClientAccountRepository } from "../ports/client-account.repository";
import { AssertClientAccessUseCase } from "./assert-client-access.use-case";

export type DeleteClientAccountCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/** Suppression définitive contrôlée (mission §"suppression définitive contrôlée") — exige un
 *  archivage préalable (`ClientAccount.assertDeletable()`) ; la présence de Tenders ou d'entrées
 *  Knowledge Base dépendantes est ensuite garantie par la contrainte `ON DELETE RESTRICT`
 *  (migration), traduite par le repository en `ClientAccountHasDependenciesError`. */
@Injectable()
export class DeleteClientAccountUseCase {
  constructor(
    @Inject(CLIENT_ACCOUNT_REPOSITORY) private readonly clientAccountRepository: ClientAccountRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: DeleteClientAccountCommand): Promise<void> {
    const client = await this.clientAccountRepository.findById(command);
    if (!client) {
      throw new ClientAccountNotFoundError();
    }

    await this.assertClientAccessUseCase.execute({ ...command, permission: ClientPermission.Delete });

    client.assertDeletable();
    await this.clientAccountRepository.delete(command);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "client_account.deleted",
      resourceType: "client_account",
      resourceId: client.id,
      requestId: command.requestId,
    });
  }
}
