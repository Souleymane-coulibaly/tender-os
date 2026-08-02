import { Inject, Injectable } from "@nestjs/common";
import { STORAGE_PROVIDER, type StorageProvider } from "../../../documents";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { computeSha256 } from "../../../../shared-kernel/file-hash";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { Readable } from "node:stream";
import { SignatureTransactionNotFoundError } from "../../domain/errors";
import { SignatureArtifact, SignatureArtifactKind, SignatureArtifactSource } from "../../domain/signature-artifact";
import { SIGNATURE_PROVIDER_PORT, type SignatureProviderPort } from "../ports/signature-provider.port";
import { SIGNATURE_TRANSACTION_REPOSITORY, type SignatureTransactionRepository } from "../ports/signature-transaction.repository";
import { toSignatureTransactionSummary, type SignatureTransactionSummary } from "../dtos";

export type RetrieveSignedArtifactsCommand = Readonly<{ organizationId: string; transactionId: string }>;

/**
 * Mission Sprint 8A §49/§50 — après confirmation SIGNED (webhook ou fake), télécharge le document
 * signé ET la preuve depuis le prestataire, calcule leur hash côté serveur, les stocke en privé.
 * Jamais une URL prestataire exposée directement au navigateur. Une preuve du fake est marquée
 * `isFakeTestEvidence: true` (mission "jamais confondue avec une preuve réelle").
 */
@Injectable()
export class RetrieveSignedArtifactsUseCase {
  constructor(
    @Inject(SIGNATURE_TRANSACTION_REPOSITORY) private readonly signatureTransactionRepository: SignatureTransactionRepository,
    @Inject(SIGNATURE_PROVIDER_PORT) private readonly signatureProvider: SignatureProviderPort,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: RetrieveSignedArtifactsCommand): Promise<SignatureTransactionSummary> {
    const found = await this.signatureTransactionRepository.findById({ organizationId: command.organizationId, transactionId: command.transactionId });
    if (!found) {
      throw new SignatureTransactionNotFoundError();
    }
    const { transaction } = found;
    const isFake = transaction.provider === "FAKE";
    const occurredAt = this.clock.now();

    const signedDocumentBytes = await this.signatureProvider.downloadSignedDocument({
      providerTransactionId: transaction.providerTransactionId ?? "",
      providerDocumentId: transaction.exportArtifactId,
    });
    const signedDocumentHash = computeSha256(signedDocumentBytes);
    const signedDocumentKey = `signatures/${command.organizationId}/${transaction.id}/signed-document.pdf`;
    await this.storageProvider.put({ key: signedDocumentKey, content: Readable.from(signedDocumentBytes), contentType: "application/pdf", sizeBytes: signedDocumentBytes.length });

    const signedArtifact = SignatureArtifact.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      signatureTransactionId: transaction.id,
      kind: SignatureArtifactKind.SignedDocument,
      fileName: "document-signe.pdf",
      mimeType: "application/pdf",
      fileSize: signedDocumentBytes.length,
      fileHash: signedDocumentHash,
      storageKey: signedDocumentKey,
      source: SignatureArtifactSource.Provider,
      isFakeTestEvidence: isFake,
      occurredAt,
    });
    await this.signatureTransactionRepository.addArtifact(signedArtifact);

    const evidenceBytes = await this.signatureProvider.downloadEvidence({ providerTransactionId: transaction.providerTransactionId ?? "" });
    const evidenceHash = computeSha256(evidenceBytes);
    const evidenceKey = `signatures/${command.organizationId}/${transaction.id}/evidence.${isFake ? "json" : "pdf"}`;
    await this.storageProvider.put({
      key: evidenceKey,
      content: Readable.from(evidenceBytes),
      contentType: isFake ? "application/json" : "application/pdf",
      sizeBytes: evidenceBytes.length,
    });

    const evidenceArtifact = SignatureArtifact.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      signatureTransactionId: transaction.id,
      kind: SignatureArtifactKind.Proof,
      fileName: isFake ? "FAKE_TEST_EVIDENCE.json" : "preuve-signature.pdf",
      mimeType: isFake ? "application/json" : "application/pdf",
      fileSize: evidenceBytes.length,
      fileHash: evidenceHash,
      storageKey: evidenceKey,
      source: SignatureArtifactSource.Provider,
      isFakeTestEvidence: isFake,
      occurredAt,
    });
    await this.signatureTransactionRepository.addArtifact(evidenceArtifact);

    return toSignatureTransactionSummary({ transaction, participants: found.participants, artifacts: [signedArtifact, evidenceArtifact] });
  }
}
