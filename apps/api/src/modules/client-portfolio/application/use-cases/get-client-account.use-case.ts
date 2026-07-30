import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../domain/client-permission";
import { ClientAccountNotFoundError } from "../../domain/errors";
import { toClientAccountSummary, type ClientAccountSummary } from "../dtos";
import { CLIENT_ACCOUNT_REPOSITORY, type ClientAccountRepository } from "../ports/client-account.repository";
import { AssertClientAccessUseCase } from "./assert-client-access.use-case";

export type GetClientAccountQuery = Readonly<{ organizationId: string; clientAccountId: string; actorId: string; actorRole: string }>;

@Injectable()
export class GetClientAccountUseCase {
  constructor(
    @Inject(CLIENT_ACCOUNT_REPOSITORY) private readonly clientAccountRepository: ClientAccountRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetClientAccountQuery): Promise<ClientAccountSummary> {
    const client = await this.clientAccountRepository.findById(query);
    if (!client) {
      throw new ClientAccountNotFoundError();
    }

    await this.assertClientAccessUseCase.execute({ ...query, permission: ClientPermission.Read });

    return toClientAccountSummary(client);
  }
}
