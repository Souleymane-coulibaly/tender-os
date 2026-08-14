import { Inject, Injectable } from "@nestjs/common";
import { AO_CREDIT_LEDGER_REPOSITORY, type AoCreditLedgerRepository } from "../ports/ao-credit-ledger.repository";

@Injectable()
export class GetAoCreditBalanceUseCase {
  constructor(@Inject(AO_CREDIT_LEDGER_REPOSITORY) private readonly ledgerRepository: AoCreditLedgerRepository) {}

  async execute(organizationId: string): Promise<number> {
    return this.ledgerRepository.getBalance(organizationId);
  }
}
