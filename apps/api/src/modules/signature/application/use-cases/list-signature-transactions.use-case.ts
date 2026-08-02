import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { toSignatureTransactionSummary, type SignatureTransactionSummary } from "../dtos";
import { SIGNATURE_TRANSACTION_REPOSITORY, type SignatureTransactionRepository } from "../ports/signature-transaction.repository";

export type ListSignatureTransactionsQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

@Injectable()
export class ListSignatureTransactionsUseCase {
  constructor(
    @Inject(SIGNATURE_TRANSACTION_REPOSITORY) private readonly signatureTransactionRepository: SignatureTransactionRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListSignatureTransactionsQuery): Promise<readonly SignatureTransactionSummary[]> {
    const tender = await this.getTenderUseCase.execute({ organizationId: query.organizationId, tenderId: query.tenderId, actorId: query.actorId, actorRole: query.actorRole });
    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadExport,
    });
    const transactions = await this.signatureTransactionRepository.listForTender({ organizationId: query.organizationId, tenderId: query.tenderId });
    return transactions.map(toSignatureTransactionSummary);
  }
}
