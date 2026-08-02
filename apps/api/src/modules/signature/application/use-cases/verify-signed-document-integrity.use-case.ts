import { Inject, Injectable } from "@nestjs/common";
import type { Readable } from "node:stream";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { STORAGE_PROVIDER, type StorageProvider } from "../../../documents";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { computeSha256 } from "../../../../shared-kernel/file-hash";
import { SignatureArtifactKind } from "../../domain/signature-artifact";
import { SignatureArtifactNotFoundError, SignatureTransactionNotFoundError } from "../../domain/errors";
import { toSignatureTransactionSummary, type SignatureTransactionSummary } from "../dtos";
import { SIGNATURE_TRANSACTION_REPOSITORY, type SignatureTransactionRepository } from "../ports/signature-transaction.repository";

export type VerifySignedDocumentIntegrityCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; transactionId: string }>;

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * Mission Sprint 8A §46/§51 — vérification d'intégrité RÉELLE mais LIMITÉE et honnêtement décrite :
 * recalcule le hash du fichier signé RÉELLEMENT stocké et le compare au hash enregistré au moment
 * de la récupération (mission "absence de remplacement silencieux"). Ne prétend PAS valider
 * cryptographiquement la signature électronique elle-même (aucune bibliothèque de vérification de
 * signature PDF intégrée ici — mission "ne prétends pas valider cryptographiquement une signature
 * PDF si l'implémentation ne le fait pas réellement"). Seule voie légitime vers
 * `SignatureTransaction.markVerified()`/`SignatureArtifact.markVerified()`.
 */
@Injectable()
export class VerifySignedDocumentIntegrityUseCase {
  constructor(
    @Inject(SIGNATURE_TRANSACTION_REPOSITORY) private readonly signatureTransactionRepository: SignatureTransactionRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: VerifySignedDocumentIntegrityCommand): Promise<SignatureTransactionSummary> {
    const found = await this.signatureTransactionRepository.findById({ organizationId: command.organizationId, transactionId: command.transactionId });
    if (!found) {
      throw new SignatureTransactionNotFoundError();
    }
    const { transaction, participants, artifacts } = found;

    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: transaction.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageExport,
    });

    const signedDocument = artifacts.find((a) => a.kind === SignatureArtifactKind.SignedDocument);
    if (!signedDocument) {
      throw new SignatureArtifactNotFoundError();
    }

    const stream = await this.storageProvider.openReadStream(signedDocument.storageKey);
    const bytes = await streamToBuffer(stream);
    const actualHash = computeSha256(bytes);

    const occurredAt = this.clock.now();
    if (actualHash !== signedDocument.fileHash) {
      signedDocument.markInvalid({ verifiedBy: command.actorId, occurredAt });
      await this.signatureTransactionRepository.saveArtifact(signedDocument);
      transaction.markInvalid(occurredAt);
      await this.signatureTransactionRepository.save(transaction);
      return toSignatureTransactionSummary({ transaction, participants, artifacts });
    }

    signedDocument.markVerified({ verifiedBy: command.actorId, occurredAt });
    await this.signatureTransactionRepository.saveArtifact(signedDocument);
    transaction.markVerified();
    await this.signatureTransactionRepository.save(transaction);

    return toSignatureTransactionSummary({ transaction, participants, artifacts });
  }
}
