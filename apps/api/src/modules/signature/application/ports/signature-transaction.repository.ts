import type { SignatureArtifact } from "../../domain/signature-artifact";
import type { SignatureParticipant } from "../../domain/signature-participant";
import type { SignatureTransaction } from "../../domain/signature-transaction.aggregate";

export type SignatureTransactionWithDetails = {
  transaction: SignatureTransaction;
  participants: readonly SignatureParticipant[];
  artifacts: readonly SignatureArtifact[];
};

export interface SignatureTransactionRepository {
  create(input: { transaction: SignatureTransaction; participants: readonly SignatureParticipant[] }): Promise<void>;
  findById(input: { organizationId: string; transactionId: string }): Promise<SignatureTransactionWithDetails | null>;
  findByProviderTransactionId(input: { provider: string; providerTransactionId: string }): Promise<SignatureTransactionWithDetails | null>;
  listForTender(input: { organizationId: string; tenderId: string }): Promise<readonly SignatureTransactionWithDetails[]>;
  save(transaction: SignatureTransaction): Promise<void>;
  saveParticipant(participant: SignatureParticipant): Promise<void>;
  addArtifact(artifact: SignatureArtifact): Promise<void>;
  saveArtifact(artifact: SignatureArtifact): Promise<void>;
}

export const SIGNATURE_TRANSACTION_REPOSITORY = Symbol("SIGNATURE_TRANSACTION_REPOSITORY");
