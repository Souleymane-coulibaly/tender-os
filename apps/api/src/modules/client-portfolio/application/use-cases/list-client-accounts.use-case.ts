import { Inject, Injectable } from "@nestjs/common";
import type { ClientAccountStatus } from "../../domain/client-account-status";
import { toClientAccountSummary, type ClientAccountSummary } from "../dtos";
import { CLIENT_ACCOUNT_REPOSITORY, type ClientAccountRepository } from "../ports/client-account.repository";
import { ListAccessibleClientsUseCase } from "./list-accessible-clients.use-case";

export type ListClientAccountsQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  status?: ClientAccountStatus | undefined;
  includeArchived: boolean;
  nameSearch?: string | undefined;
  cursor?: string | undefined;
  limit: number;
}>;

export type ListClientAccountsResult = Readonly<{ items: ClientAccountSummary[]; nextCursor: string | null; total: number }>;

/** Portefeuille client (mission §"ouvrir le portefeuille client") — restreint automatiquement aux
 *  clients accessibles à l'acteur (mission §"un utilisateur standard ne voit que les clients
 *  auxquels il est affecté", `ListAccessibleClientsUseCase`) : jamais un filtrage en mémoire après
 *  chargement complet (mission §"Performance"). */
@Injectable()
export class ListClientAccountsUseCase {
  constructor(
    @Inject(CLIENT_ACCOUNT_REPOSITORY) private readonly clientAccountRepository: ClientAccountRepository,
    private readonly listAccessibleClientsUseCase: ListAccessibleClientsUseCase,
  ) {}

  async execute(query: ListClientAccountsQuery): Promise<ListClientAccountsResult> {
    const accessible = await this.listAccessibleClientsUseCase.execute(query);

    if (!accessible.allClients && accessible.clientAccountIds.length === 0) {
      return { items: [], nextCursor: null, total: 0 };
    }

    const result = await this.clientAccountRepository.list({
      organizationId: query.organizationId,
      restrictToClientAccountIds: accessible.allClients ? undefined : accessible.clientAccountIds,
      status: query.status,
      includeArchived: query.includeArchived,
      nameSearch: query.nameSearch,
      cursor: query.cursor,
      limit: query.limit,
    });

    return { items: result.items.map(toClientAccountSummary), nextCursor: result.nextCursor, total: result.total };
  }
}
