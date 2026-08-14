import { Inject, Injectable } from "@nestjs/common";
import { assertHasCapability, PlatformCapability, type PlatformRole } from "../../../platform-administration";
import { AO_CREDIT_LEDGER_REPOSITORY, type AoCreditLedgerPage, type AoCreditLedgerRepository } from "../ports/ao-credit-ledger.repository";

export type ListAoCreditLedgerQuery = Readonly<{ organizationId: string; cursor?: string | undefined; limit: number; actorPlatformRole: PlatformRole }>;

const MAX_PAGE_SIZE = 50;

/** V2 Sprint 22 (billing, étape 22B) — historique complet Platform Admin (mission §31 "solde ...
 *  monthly grant ... historique"). La vue self-service organisation (22D) réutilisera
 *  `GetAoCreditBalanceUseCase` sans exposer l'historique complet des autres organisations. */
@Injectable()
export class ListAoCreditLedgerUseCase {
  constructor(@Inject(AO_CREDIT_LEDGER_REPOSITORY) private readonly ledgerRepository: AoCreditLedgerRepository) {}

  async execute(query: ListAoCreditLedgerQuery): Promise<AoCreditLedgerPage> {
    assertHasCapability(query.actorPlatformRole, PlatformCapability.AoCreditsRead);
    const limit = Math.min(query.limit, MAX_PAGE_SIZE);
    return this.ledgerRepository.list(query.organizationId, { cursor: query.cursor, limit });
  }
}
