import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { SignatureTransactionNotFoundError } from "../../domain/errors";
import { toSignatureTransactionSummary, type SignatureTransactionSummary } from "../dtos";
import { SIGNATURE_TRANSACTION_REPOSITORY, type SignatureTransactionRepository } from "../ports/signature-transaction.repository";

export type GetSignatureTransactionQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; transactionId: string }>;

@Injectable()
export class GetSignatureTransactionUseCase {
  constructor(
    @Inject(SIGNATURE_TRANSACTION_REPOSITORY) private readonly signatureTransactionRepository: SignatureTransactionRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetSignatureTransactionQuery): Promise<SignatureTransactionSummary> {
    const found = await this.signatureTransactionRepository.findById({ organizationId: query.organizationId, transactionId: query.transactionId });
    if (!found) {
      throw new SignatureTransactionNotFoundError();
    }
    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: found.transaction.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadExport,
    });
    return toSignatureTransactionSummary(found);
  }
}
