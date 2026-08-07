import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { CreateDocumentWithFirstVersionUseCase, DocumentDomain, DocumentOrigin, InternalDocumentCleanupService } from "../../../documents";
import { GetTenderUseCase } from "../../../tenders";
import { classifyDceDocument } from "../../domain/dce-document-classifier";
import { DceDocument } from "../../domain/dce-document.entity";
import { determineDceDocumentProcessingStatus } from "../../domain/dce-document-processing-status";
import { DceNotFoundError, TooManyFilesError } from "../../domain/errors";
import { isSignatureCompatibleWithExtension } from "../../domain/allowed-file-types";
import { DcePermission } from "../../domain/dce-permission";
import { assertHasDcePermission } from "../policies/dce-authorization.policy";
import { assertTenderNotArchivedForDceMutation } from "../policies/dce-tender-mutation.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { DCE_DOCUMENT_REPOSITORY, type DceDocumentRepository } from "../ports/dce-document.repository";
import { DCE_REPOSITORY, type DceRepository } from "../ports/dce.repository";
import {
  DCE_DOCUMENT_EXTRACTION_TRIGGER,
  type DceDocumentExtractionTrigger,
} from "../ports/document-extraction-trigger";
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
 * `.zip` ici : une archive doit passer par StartDceZipImportUseCase/ProcessDceZipImportUseCase
 * (import asynchrone, mission Sprint 8A.2), qui applique la sécurité obligatoire (mission
 * §"sécurité ZIP") avant de réutiliser exactement le même traitement par-fichier que ce cas
 * d'usage.
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
  private readonly logger = new Logger(ImportDceFilesUseCase.name);

  constructor(
    @Inject(DCE_REPOSITORY) private readonly dceRepository: DceRepository,
    @Inject(DCE_DOCUMENT_REPOSITORY) private readonly dceDocumentRepository: DceDocumentRepository,
    @Inject(FILE_SIGNATURE_DETECTOR) private readonly signatureDetector: FileSignatureDetector,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly createDocumentWithFirstVersionUseCase: CreateDocumentWithFirstVersionUseCase,
    private readonly internalDocumentCleanupService: InternalDocumentCleanupService,
    @Optional()
    @Inject(DCE_DOCUMENT_EXTRACTION_TRIGGER)
    private readonly extractionTrigger?: DceDocumentExtractionTrigger,
  ) {}

  async execute(command: ImportDceFilesCommand): Promise<ImportDceFilesResult> {
    assertHasDcePermission(command.actorRole, DcePermission.Import);

    if (command.files.length > command.maxFilesPerImport) {
      throw new TooManyFilesError({ maxFiles: command.maxFilesPerImport });
    }

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

      // Mission P1-2 — tout le cycle "vérifier l'absence de doublon actif puis créer" s'exécute
      // à l'intérieur d'un verrou consultatif transactionnel scopé à ce DCE
      // (runExclusiveForDce) : un `find` suivi d'un `insert` hors verrou serait une race
      // condition check-then-insert entre deux imports concurrents du même fichier.
      const outcome = await this.dceDocumentRepository.runExclusiveForDce({
        dceId: dce.id.value,
        fn: async () => {
          const duplicate = await this.dceDocumentRepository.findActiveByChecksum({
            organizationId: command.organizationId,
            dceId: dce.id.value,
            checksum: validated.checksum,
          });
          if (duplicate) {
            return { kind: "duplicate" as const, duplicate };
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

          try {
            const occurredAt = this.clock.now();
            const category = classifyDceDocument({
              filename: validated.sanitizedFilename,
              extension: validated.extension,
            });
            // Mission P1-3 — le statut de préparation dépend du format réel, jamais un
            // READY_FOR_OCR systématique (voir determineDceDocumentProcessingStatus).
            const processingStatus = determineDceDocumentProcessingStatus(validated.extension);

            const link = DceDocument.create({
              dceId: dce.id.value,
              documentId: documentSummary.id,
              organizationId: command.organizationId,
              createdByUserId: command.actorId,
              category,
              occurredAt,
            });
            link.transitionProcessingStatus(processingStatus, occurredAt);
            await this.dceDocumentRepository.create(link);

            await this.auditLogWriter.record({
              organizationId: command.organizationId,
              actorId: command.actorId,
              action: "dce.document_imported",
              resourceType: "dce_document",
              resourceId: documentSummary.id,
              requestId: command.requestId,
              metadata: {
                dceId: dce.id.value,
                tenderId: command.tenderId,
                checksum: validated.checksum,
                category,
                processingStatus,
              },
            });

            const summary: DceDocumentSummary = {
              dceId: dce.id.value,
              documentId: documentSummary.id,
              originalFilename: validated.sanitizedFilename,
              sanitizedFilename: validated.sanitizedFilename,
              mimeType: file.mimeType,
              extension: validated.extension,
              sizeBytes: validated.sizeBytes,
              checksum: validated.checksum,
              currentVersionNumber: 1,
              currentVersionId: documentSummary.currentVersion!.id,
              category: link.category,
              processingStatus: link.processingStatus,
              createdByUserId: command.actorId,
              createdAt: link.createdAt.toISOString(),
            };
            return { kind: "accepted" as const, summary };
          } catch (error) {
            // Mission P1-1 bis — compensation via un mécanisme interne, jamais DeleteDocumentUseCase
            // (protégé par DocumentPermission.Delete : un CONTRIBUTOR a dce:import mais pas
            // forcément document:delete, ce qui ferait échouer silencieusement la compensation
            // elle-même). Ce Document vient d'être créé DANS cette tentative, jamais réutilisé (ce
            // use case crée toujours un Document neuf par fichier accepté) — le nettoyer ici ne
            // peut donc jamais affecter un autre import ni une ressource préexistante.
            // InternalDocumentCleanupService ne lève jamais lui-même (échecs journalisés en
            // interne) ; le `catch` ci-dessous n'est qu'un filet de sécurité supplémentaire pour
            // garantir, même en cas de bug, que l'erreur d'origine reste toujours prioritaire.
            await this.internalDocumentCleanupService
              .purgeJustCreatedDocument({ organizationId: command.organizationId, documentId: documentSummary.id })
              .catch((cleanupError: unknown) => {
                this.logger.error(
                  `Compensation failed: could not purge orphaned Document ${documentSummary.id} ` +
                    `after a DceDocument linking failure (dceId=${dce.id.value}). Manual cleanup required.`,
                  cleanupError instanceof Error ? cleanupError.stack : String(cleanupError),
                );
              });
            throw error;
          }
        },
      });

      if (outcome.kind === "duplicate") {
        rejected.push({
          originalFilename: file.originalFilename,
          reason: `duplicate of an already imported file (${outcome.duplicate.originalFilename}).`,
        });
        continue;
      }

      accepted.push(outcome.summary);
    }

    if (accepted.length > 0) {
      dce.markImported(this.clock.now());
      await this.dceRepository.save(dce);
    }

    // Mission Sprint 8A.2 — déclenche l'extraction pour chaque fichier accepté (jamais bloqué par
    // un déclenchement individuel en échec : chaque appel est indépendant, un import déjà accepté
    // ne doit jamais être remis en cause parce que le déclenchement système, best-effort, échoue).
    for (const summary of accepted) {
      try {
        await this.extractionTrigger?.ensureExtractionTriggered({
          organizationId: command.organizationId,
          tenderId: command.tenderId,
          documentId: summary.documentId,
          actorId: command.actorId,
          requestId: command.requestId,
        });
      } catch (error) {
        this.logger.error(
          `Auto-extraction trigger failed for document ${summary.documentId} after a successful DCE import: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { accepted, rejected };
  }
}
