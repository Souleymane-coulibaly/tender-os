import { Inject, Injectable } from "@nestjs/common";
import type { Readable } from "node:stream";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { STORAGE_PROVIDER, type StorageProvider } from "../../../documents";
import { EXPORT_JOB_REPOSITORY, ExportArtifactNotFoundError, type ExportJobRepository } from "../../../export";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { SignatureTransactionNotFoundError } from "../../domain/errors";
import { SIGNATURE_PROVIDER_PORT, type SignatureProviderPort } from "../ports/signature-provider.port";
import { SIGNATORY_REPOSITORY, type SignatoryRepository } from "../ports/signatory.repository";
import { SIGNATURE_TRANSACTION_REPOSITORY, type SignatureTransactionRepository } from "../ports/signature-transaction.repository";
import { toSignatureTransactionSummary, type SignatureTransactionSummary } from "../dtos";

export type StartSignatureTransactionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  transactionId: string;
  returnUrl: string;
}>;

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Mission Sprint 8A §43 — exécute le parcours documenté : créer la transaction chez le
 * prestataire, uploader le document FIGÉ, ajouter chaque participant, démarrer. Toute erreur
 * marque la transaction FAILED, jamais un état ambigu.
 */
@Injectable()
export class StartSignatureTransactionUseCase {
  constructor(
    @Inject(SIGNATURE_TRANSACTION_REPOSITORY) private readonly signatureTransactionRepository: SignatureTransactionRepository,
    @Inject(SIGNATORY_REPOSITORY) private readonly signatoryRepository: SignatoryRepository,
    @Inject(SIGNATURE_PROVIDER_PORT) private readonly signatureProvider: SignatureProviderPort,
    @Inject(EXPORT_JOB_REPOSITORY) private readonly exportJobRepository: ExportJobRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: StartSignatureTransactionCommand): Promise<SignatureTransactionSummary> {
    const found = await this.signatureTransactionRepository.findById({ organizationId: command.organizationId, transactionId: command.transactionId });
    if (!found) {
      throw new SignatureTransactionNotFoundError();
    }
    const { transaction, participants } = found;

    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: transaction.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ApproveExport,
    });

    const exportFound = await this.exportJobRepository.findByArtifactId({ organizationId: command.organizationId, exportArtifactId: transaction.exportArtifactId });
    if (!exportFound || !exportFound.artifact) {
      throw new ExportArtifactNotFoundError();
    }
    const artifact = exportFound.artifact;

    try {
      const { providerTransactionId } = await this.signatureProvider.createTransaction({
        organizationId: command.organizationId,
        localTransactionId: transaction.id,
      });

      const stream = await this.storageProvider.openReadStream(artifact.storageKey);
      const content = await streamToBuffer(stream);

      const { providerDocumentId } = await this.signatureProvider.uploadDocument({
        providerTransactionId,
        fileName: artifact.fileName,
        content,
        mimeType: artifact.mimeType,
      });

      for (const participant of participants) {
        const signatory = await this.signatoryRepository.findById({ organizationId: command.organizationId, signatoryId: participant.signatoryId });
        if (!signatory) continue;
        const { providerParticipantId } = await this.signatureProvider.addParticipant({
          providerTransactionId,
          providerDocumentId,
          firstName: signatory.firstName,
          lastName: signatory.lastName,
          email: signatory.professionalEmail,
          level: transaction.requestedLevel ?? "LEVEL1",
          sequence: participant.sequence,
          invitationRedirectUrl: command.returnUrl,
        });
        participant.updateStatus({ status: "SENT", providerParticipantId });
        await this.signatureTransactionRepository.saveParticipant(participant);
      }

      transaction.markReadyToSend({ providerTransactionId, confirmedLevel: transaction.requestedLevel });
      await this.signatureTransactionRepository.save(transaction);

      await this.signatureProvider.startTransaction({ providerTransactionId });
      transaction.markSent(this.clock.now());
      await this.signatureTransactionRepository.save(transaction);
    } catch (error) {
      transaction.markFailed({
        errorCode: "SIGNATURE_START_FAILED",
        errorMessage: (error instanceof Error ? error.message : "unknown error").slice(0, 500),
        occurredAt: this.clock.now(),
      });
      await this.signatureTransactionRepository.save(transaction);
      throw error;
    }

    return toSignatureTransactionSummary({ transaction, participants, artifacts: [] });
  }
}
