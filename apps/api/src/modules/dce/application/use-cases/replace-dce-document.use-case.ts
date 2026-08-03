import { Inject, Injectable } from "@nestjs/common";
import { AddDocumentVersionUseCase } from "../../../documents";
import { GetTenderUseCase } from "../../../tenders";
import { isSignatureCompatibleWithExtension } from "../../domain/allowed-file-types";
import { DceDocumentNotFoundError, DceNotFoundError, UnsupportedFileTypeError } from "../../domain/errors";
import { DcePermission } from "../../domain/dce-permission";
import { assertHasDcePermission } from "../policies/dce-authorization.policy";
import { assertTenderNotArchivedForDceMutation } from "../policies/dce-tender-mutation.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { DCE_DOCUMENT_REPOSITORY, type DceDocumentRepository } from "../ports/dce-document.repository";
import { DCE_REPOSITORY, type DceRepository } from "../ports/dce.repository";
import { FILE_SIGNATURE_DETECTOR, type FileSignatureDetector } from "../ports/file-signature-detector";
import { validateIncomingDceFile } from "../incoming-file";
import type { DceDocumentSummary } from "../dtos";
import type { IncomingDceUpload } from "./import-dce-files.use-case";

export type ReplaceDceDocumentCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  documentId: string;
  actorId: string;
  actorRole: string;
  file: IncomingDceUpload;
  maxFileSizeBytes: number;
  requestId?: string | undefined;
}>;

/**
 * Remplace le contenu d'un fichier du DCE en conservant l'historique des versions (mission
 * §"remplacer un fichier ... si cette stratégie existe déjà") — délègue à AddDocumentVersionUseCase
 * (Documents), qui crée une NOUVELLE DocumentVersion et y fait pointer le Document plutôt que
 * d'écraser quoi que ce soit ; les versions précédentes restent lisibles via Documents (hors
 * périmètre de l'API DCE de ce sprint, qui n'expose que la version courante).
 */
@Injectable()
export class ReplaceDceDocumentUseCase {
  constructor(
    @Inject(DCE_REPOSITORY) private readonly dceRepository: DceRepository,
    @Inject(DCE_DOCUMENT_REPOSITORY) private readonly dceDocumentRepository: DceDocumentRepository,
    @Inject(FILE_SIGNATURE_DETECTOR) private readonly signatureDetector: FileSignatureDetector,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly addDocumentVersionUseCase: AddDocumentVersionUseCase,
  ) {}

  async execute(command: ReplaceDceDocumentCommand): Promise<DceDocumentSummary> {
    assertHasDcePermission(command.actorRole, DcePermission.Replace);

    const tender = await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });
    assertTenderNotArchivedForDceMutation(tender);

    const dce = await this.dceRepository.findByTenderId({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
    });
    if (!dce) {
      throw new DceNotFoundError();
    }

    const link = await this.dceDocumentRepository.findByDceIdAndDocumentId({
      organizationId: command.organizationId,
      dceId: dce.id.value,
      documentId: command.documentId,
    });
    if (!link) {
      throw new DceDocumentNotFoundError();
    }

    const validated = validateIncomingDceFile(command.file, command.maxFileSizeBytes);
    if (validated.extension === "zip") {
      throw new UnsupportedFileTypeError({ filename: command.file.originalFilename });
    }
    const detected = this.signatureDetector.detect(command.file.buffer);
    if (!isSignatureCompatibleWithExtension(detected?.mimeType ?? null, validated.extension)) {
      throw new UnsupportedFileTypeError({ filename: command.file.originalFilename });
    }

    await this.addDocumentVersionUseCase.execute({
      organizationId: command.organizationId,
      documentId: command.documentId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      file: command.file,
      maxFileSizeBytes: command.maxFileSizeBytes,
      requestId: command.requestId,
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "dce.document_replaced",
      resourceType: "dce_document",
      resourceId: command.documentId,
      requestId: command.requestId,
      metadata: { dceId: dce.id.value, tenderId: command.tenderId, checksum: validated.checksum },
    });

    const summary = await this.dceDocumentRepository.getSummaryByDocumentId({
      organizationId: command.organizationId,
      dceId: dce.id.value,
      documentId: command.documentId,
    });
    if (!summary) {
      throw new DceDocumentNotFoundError();
    }
    return summary;
  }
}
