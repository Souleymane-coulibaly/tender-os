import { Inject, Injectable } from "@nestjs/common";
import { Readable } from "node:stream";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { STORAGE_PROVIDER, type StorageProvider } from "../../../documents";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { computeSha256 } from "../../../../shared-kernel/file-hash";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { SignatureTransactionNotFoundError } from "../../domain/errors";
import { SignatureArtifact, SignatureArtifactKind, SignatureArtifactSource } from "../../domain/signature-artifact";
import { toSignatureArtifactSummary, type SignatureArtifactSummary } from "../dtos";
import { SIGNATURE_TRANSACTION_REPOSITORY, type SignatureTransactionRepository } from "../ports/signature-transaction.repository";

export type ImportSignedDocumentCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  transactionId: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
}>;

const ALLOWED_MIME_TYPES = new Set(["application/pdf"]);
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * Mission Sprint 8A §48 — parcours manuel : un utilisateur autorisé importe un document signé
 * provenant d'un outil externe. Jamais automatiquement VERIFIED (mission "un import manuel ne doit
 * pas être automatiquement marqué VERIFIED") — reste `TO_VERIFY`/`IMPORTED` jusqu'à
 * `VerifySignedDocumentIntegrityUseCase`.
 */
@Injectable()
export class ImportSignedDocumentUseCase {
  constructor(
    @Inject(SIGNATURE_TRANSACTION_REPOSITORY) private readonly signatureTransactionRepository: SignatureTransactionRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: ImportSignedDocumentCommand): Promise<SignatureArtifactSummary> {
    const found = await this.signatureTransactionRepository.findById({ organizationId: command.organizationId, transactionId: command.transactionId });
    if (!found) {
      throw new SignatureTransactionNotFoundError();
    }
    const { transaction } = found;

    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: transaction.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ApproveExport,
    });

    if (!ALLOWED_MIME_TYPES.has(command.mimeType)) {
      throw new Error(`Unsupported mime type for a signed document import: "${command.mimeType}" (expected application/pdf)`);
    }
    if (command.content.length === 0 || command.content.length > MAX_FILE_SIZE_BYTES) {
      throw new Error("Imported file size is invalid.");
    }

    const occurredAt = this.clock.now();
    const fileHash = computeSha256(command.content);
    const storageKey = `signatures/${command.organizationId}/${transaction.id}/imported-${this.idGenerator.generate()}.pdf`;
    await this.storageProvider.put({ key: storageKey, content: Readable.from(command.content), contentType: command.mimeType, sizeBytes: command.content.length });

    const artifact = SignatureArtifact.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      signatureTransactionId: transaction.id,
      kind: SignatureArtifactKind.SignedDocument,
      fileName: command.fileName,
      mimeType: command.mimeType,
      fileSize: command.content.length,
      fileHash,
      storageKey,
      source: SignatureArtifactSource.ManualImport,
      importedBy: command.actorId,
      occurredAt,
    });

    await this.signatureTransactionRepository.addArtifact(artifact);
    return toSignatureArtifactSummary(artifact);
  }
}
