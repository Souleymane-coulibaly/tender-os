import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { CreateDocumentWithFirstVersionUseCase, DocumentDomain, DocumentOrigin } from "../../../documents";
import { GetTenderUseCase } from "../../../tenders";
import { DceDocument } from "../../domain/dce-document.entity";
import { DceNotFoundError, TooManyFilesError } from "../../domain/errors";
import { isSignatureCompatibleWithExtension } from "../../domain/allowed-file-types";
import { DcePermission } from "../../domain/dce-permission";
import { assertHasDcePermission } from "../policies/dce-authorization.policy";
import { assertTenderNotArchivedForDceMutation } from "../policies/dce-tender-mutation.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { DCE_DOCUMENT_REPOSITORY, type DceDocumentRepository } from "../ports/dce-document.repository";
import { DCE_REPOSITORY, type DceRepository } from "../ports/dce.repository";
import { FILE_SIGNATURE_DETECTOR, type FileSignatureDetector } from "../ports/file-signature-detector";
import { validateIncomingDceFile } from "../incoming-file";
import type { DceDocumentSummary } from "../dtos";

export type IncomingDceUpload = Readonly<{ buffer: Buffer; originalFilename: string; mimeType: string }>;

export type ImportDceFilesCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  files: readonly IncomingDceUpload[];
  maxFileSizeBytes: number;
  maxFilesPerImport: number;
  requestId?: string | undefined;
}>;

export type ImportDceFilesRejection = Readonly<{ originalFilename: string; reason: string }>;

export type ImportDceFilesResult = Readonly<{
  accepted: DceDocumentSummary[];
  rejected: readonly ImportDceFilesRejection[];
}>;

/**
 * Import d'un fichier unique OU de plusieurs fichiers (mission Sprint 1) — un seul cas d'usage
 * pour les deux, la seconde n'étant qu'un tableau de longueur 1. N'accepte jamais un fichier
 * `.zip` ici : une archive doit passer par ImportDceZipUseCase, qui applique la sécurité
 * obligatoire (mission §"sécurité ZIP") avant de réutiliser exactement le même traitement
 * par-fichier que ce cas d'usage.
 *
 * Stratégie d'atomicité (mission §"atomicité ou stratégie de compensation") : chaque fichier est
 * traité indépendamment et séquentiellement. La création du Document sous-jacent est déjà
 * transactionnelle et auto-compensée par Documents (upload physique puis transaction DB ; le
 * fichier physique est supprimé si la transaction échoue — voir
 * CreateDocumentWithFirstVersionUseCase). Un problème de FORMAT propre à un fichier (taille,
 * type, nom, doublon) ne rejette jamais le reste du lot : il est simplement reporté dans
 * `rejected`. Un échec inattendu (perte de connexion DB, etc.) sur le fichier N interrompt le
 * traitement des fichiers suivants, mais les fichiers 1..N-1 déjà importés avec succès le restent
 * (pas de rollback global) — l'appelant peut relancer l'import avec les seuls fichiers restants,
 * l'idempotence de la détection de doublon empêchant toute réimportation accidentelle des fichiers
 * déjà traités.
 */
@Injectable()
export class ImportDceFilesUseCase {
  constructor(
    @Inject(DCE_REPOSITORY) private readonly dceRepository: DceRepository,
    @Inject(DCE_DOCUMENT_REPOSITORY) private readonly dceDocumentRepository: DceDocumentRepository,
    @Inject(FILE_SIGNATURE_DETECTOR) private readonly signatureDetector: FileSignatureDetector,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly createDocumentWithFirstVersionUseCase: CreateDocumentWithFirstVersionUseCase,
  ) {}

  async execute(command: ImportDceFilesCommand): Promise<ImportDceFilesResult> {
    assertHasDcePermission(command.actorRole, DcePermission.Import);

    if (command.files.length > command.maxFilesPerImport) {
      throw new TooManyFilesError({ maxFiles: command.maxFilesPerImport });
    }

    const tender = await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
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

    const accepted: DceDocumentSummary[] = [];
    const rejected: ImportDceFilesRejection[] = [];

    for (const file of command.files) {
      let validated: ReturnType<typeof validateIncomingDceFile>;
      try {
        validated = validateIncomingDceFile(file, command.maxFileSizeBytes);
      } catch (error) {
        rejected.push({ originalFilename: file.originalFilename, reason: (error as Error).message });
        continue;
      }

      if (validated.extension === "zip") {
        rejected.push({
          originalFilename: file.originalFilename,
          reason: "ZIP archives must be imported via the archive import, not the file import.",
        });
        continue;
      }

      const detected = this.signatureDetector.detect(file.buffer);
      if (!isSignatureCompatibleWithExtension(detected?.mimeType ?? null, validated.extension)) {
        rejected.push({
          originalFilename: file.originalFilename,
          reason: "the file content does not match its declared extension.",
        });
        continue;
      }

      const duplicate = await this.dceDocumentRepository.findActiveByChecksum({
        organizationId: command.organizationId,
        dceId: dce.id.value,
        checksum: validated.checksum,
      });
      if (duplicate) {
        rejected.push({
          originalFilename: file.originalFilename,
          reason: `duplicate of an already imported file (${duplicate.originalFilename}).`,
        });
        continue;
      }

      const documentSummary = await this.createDocumentWithFirstVersionUseCase.execute({
        organizationId: command.organizationId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        title: validated.sanitizedFilename,
        origin: DocumentOrigin.Dce,
        domain: DocumentDomain.Tender,
        file: { buffer: file.buffer, originalFilename: file.originalFilename, mimeType: file.mimeType },
        maxFileSizeBytes: command.maxFileSizeBytes,
        requestId: command.requestId,
      });

      const link = DceDocument.create({
        dceId: dce.id.value,
        documentId: documentSummary.id,
        organizationId: command.organizationId,
        createdByUserId: command.actorId,
        occurredAt: this.clock.now(),
      });
      await this.dceDocumentRepository.create(link);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "dce.document_imported",
        resourceType: "dce_document",
        resourceId: documentSummary.id,
        requestId: command.requestId,
        metadata: { dceId: dce.id.value, tenderId: command.tenderId, checksum: validated.checksum },
      });

      accepted.push({
        dceId: dce.id.value,
        documentId: documentSummary.id,
        originalFilename: validated.sanitizedFilename,
        sanitizedFilename: validated.sanitizedFilename,
        mimeType: file.mimeType,
        extension: validated.extension,
        sizeBytes: validated.sizeBytes,
        checksum: validated.checksum,
        currentVersionNumber: 1,
        createdByUserId: command.actorId,
        createdAt: link.createdAt.toISOString(),
      });
    }

    if (accepted.length > 0) {
      dce.markImported(this.clock.now());
      await this.dceRepository.save(dce);
    }

    return { accepted, rejected };
  }
}
