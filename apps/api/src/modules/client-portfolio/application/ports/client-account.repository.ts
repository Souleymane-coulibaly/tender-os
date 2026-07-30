import type { ClientAccount } from "../../domain/client-account.aggregate";
import type { ClientAccountStatus } from "../../domain/client-account-status";

export type ListClientAccountsFilter = Readonly<{
  organizationId: string;
  /** Mission §"un utilisateur standard ne voit que les clients auxquels il est affecté" — `undefined`
   *  signifie "aucune restriction" (acteur OWNER/ADMIN, voir `ListAccessibleClientsUseCase`), un
   *  tableau (même vide) restreint strictement la liste à ces identifiants. */
  restrictToClientAccountIds?: readonly string[] | undefined;
  status?: ClientAccountStatus | undefined;
  includeArchived: boolean;
  nameSearch?: string | undefined;
  cursor?: string | undefined;
  limit: number;
}>;

export type ListClientAccountsResult = Readonly<{ items: readonly ClientAccount[]; nextCursor: string | null; total: number }>;

export interface ClientAccountRepository {
  findById(input: { organizationId: string; clientAccountId: string }): Promise<ClientAccount | null>;
  findByNormalizedName(input: { organizationId: string; nameNormalized: string }): Promise<ClientAccount | null>;
  create(client: ClientAccount): Promise<void>;
  save(client: ClientAccount): Promise<void>;
  /** Suppression définitive — voir `DeleteClientAccountUseCase` pour la règle métier qui la précède
   *  (archivage préalable, aucune donnée dépendante). La contrainte `ON DELETE RESTRICT` (migration)
   *  fait échouer cette suppression au niveau base de données si des Tenders ou des entrées
   *  Knowledge Base référencent encore ce client — l'implémentation Prisma traduit cet échec en
   *  `ClientAccountHasDependenciesError`. */
  delete(input: { organizationId: string; clientAccountId: string }): Promise<void>;
  list(filter: ListClientAccountsFilter): Promise<ListClientAccountsResult>;
  countTendersByClient(input: { organizationId: string; clientAccountId: string }): Promise<number>;
  countAssignmentsByClient(input: { organizationId: string; clientAccountId: string }): Promise<number>;
}

export const CLIENT_ACCOUNT_REPOSITORY = Symbol("CLIENT_ACCOUNT_REPOSITORY");
