import { Inject, Injectable } from "@nestjs/common";
import type { Readable } from "node:stream";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { STORAGE_PROVIDER, type StorageProvider } from "../../../documents";
import { SignatureArtifactKind } from "../../domain/signature-artifact";
import { SignatureArtifactNotFoundError, SignatureTransactionNotFoundError } from "../../domain/errors";
import { SIGNATURE_TRANSACTION_REPOSITORY, type SignatureTransactionRepository } from "../ports/signature-transaction.repository";

export type DownloadSignatureArtifactQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; transactionId: string; kind: "SIGNED_DOCUMENT" | "PROOF" }>;
export type SignatureArtifactDownload = Readonly<{ stream: Readable; contentType: string; filename: string; sizeBytes: number }>;

/** Mission Sprint 8A §49/§50/§55 — jamais une URL prestataire exposée : toujours streamé depuis le
 *  stockage privé après vérification RBAC/tenant/client. Couvre à la fois "document signé"
 *  (§49 DownloadSignedDocument) et "preuve" (§50 DownloadSignatureEvidence) via `kind`. */
@Injectable()
export class DownloadSignatureArtifactUseCase {
  constructor(
    @Inject(SIGNATURE_TRANSACTION_REPOSITORY) private readonly signatureTransactionRepository: SignatureTransactionRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: DownloadSignatureArtifactQuery): Promise<SignatureArtifactDownload> {
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

    const artifact = [...found.artifacts].reverse().find((a) => a.kind === (query.kind === "SIGNED_DOCUMENT" ? SignatureArtifactKind.SignedDocument : SignatureArtifactKind.Proof));
    if (!artifact) {
      throw new SignatureArtifactNotFoundError();
    }

    const stream = await this.storageProvider.openReadStream(artifact.storageKey);
    return { stream, contentType: artifact.mimeType, filename: artifact.fileName, sizeBytes: artifact.fileSize };
  }
}
