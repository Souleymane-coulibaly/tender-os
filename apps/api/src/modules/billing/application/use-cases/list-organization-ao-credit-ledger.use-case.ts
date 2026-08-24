import { Inject, Injectable } from "@nestjs/common";
import { AO_CREDIT_LEDGER_REPOSITORY, type AoCreditLedgerPage, type AoCreditLedgerRepository } from "../ports/ao-credit-ledger.repository";

export type ListOrganizationAoCreditLedgerQuery = Readonly<{ organizationId: string; cursor?: string | undefined; limit: number }>;

const MAX_PAGE_SIZE = 50;

/**
 * Checkpoint TENDEROS-2.1-P2.3-E9 — vue self-service ORGANISATION (mission §56 "Historique des
 * crédits AO"), distincte de `ListAoCreditLedgerUseCase` (Platform Admin only, `assertHasCapability`
 * sur un `PlatformRole`). Même motif que `ListPassPurchasesUseCase`/`GetOrganizationEntitlementsUseCase`
 * dans ce même module : aucune vérification de rôle plateforme ici — la portée est bornée par
 * l'appelant (`SubscriptionUsageController`, `membership.organizationId`, jamais un `organizationId`
 * de route), pas par une capability Platform Admin. Réutilise le MÊME `AoCreditLedgerRepository.list`
 * que la vue Platform Admin — jamais un second chemin de lecture du ledger.
 */
@Injectable()
export class ListOrganizationAoCreditLedgerUseCase {
  constructor(@Inject(AO_CREDIT_LEDGER_REPOSITORY) private readonly ledgerRepository: AoCreditLedgerRepository) {}

  async execute(query: ListOrganizationAoCreditLedgerQuery): Promise<AoCreditLedgerPage> {
    const limit = Math.min(query.limit, MAX_PAGE_SIZE);
    return this.ledgerRepository.list(query.organizationId, { cursor: query.cursor, limit });
  }
}
