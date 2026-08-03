import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { ALLOWED_DCE_FILE_TYPES } from "../../domain/allowed-file-types";
import { DceImportJobNotFoundError } from "../../domain/errors";
import { DCE_CONFIG, type DceConfig } from "../../infrastructure/dce-config";
import { DCE_IMPORT_JOB_REPOSITORY, type DceImportJobRepository } from "../ports/dce-import-job.repository";
import { ZIP_ARCHIVE_INSPECTOR, type ZipArchiveInspector } from "../ports/zip-archive-inspector";
import { ImportDceFilesUseCase, type IncomingDceUpload } from "./import-dce-files.use-case";

export type ProcessDceZipImportCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  jobId: string;
  actorId: string;
  actorRole: string;
  zipBuffer: Buffer;
  requestId?: string | undefined;
}>;

function inferDeclaredMimeTypeFromExtension(extension: string): string {
  const normalized = extension.toLowerCase().replace(/^\./, "");
  const match = ALLOWED_DCE_FILE_TYPES.find((entry) => entry.extensions.includes(normalized));
  return match?.mimeType ?? "application/octet-stream";
}

/**
 * Orchestrateur du traitement en tâche de fond d'un import ZIP (mission Sprint 8A.2, correction
 * bug #3) — jamais appelé directement par un contrôleur HTTP (voir DceImportDispatcher), déclenché
 * après que la requête a créé/validé le `DceImportJob`. Réutilise TEL QUEL le durcissement
 * sécurité ZIP déjà en place (`ZipArchiveInspector`) et le traitement par-fichier déjà existant
 * (`ImportDceFilesUseCase`) — aucune réimplémentation, seulement l'orchestration du statut du job
 * autour d'eux (même principe que `ProcessDocumentExtractionUseCase`/`ProcessGenerationUseCase`).
 */
@Injectable()
export class ProcessDceZipImportUseCase {
  private readonly logger = new Logger(ProcessDceZipImportUseCase.name);

  constructor(
    @Inject(DCE_IMPORT_JOB_REPOSITORY) private readonly jobRepository: DceImportJobRepository,
    @Inject(ZIP_ARCHIVE_INSPECTOR) private readonly zipArchiveInspector: ZipArchiveInspector,
    @Inject(DCE_CONFIG) private readonly config: DceConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly importDceFilesUseCase: ImportDceFilesUseCase,
  ) {}

  async execute(command: ProcessDceZipImportCommand): Promise<void> {
    const job = await this.jobRepository.findById({ organizationId: command.organizationId, jobId: command.jobId });
    if (!job) {
      throw new DceImportJobNotFoundError();
    }

    job.markExtracting(this.clock.now());
    await this.jobRepository.save(job);

    let files: IncomingDceUpload[];
    try {
      const entries = await this.zipArchiveInspector.extract({
        buffer: command.zipBuffer,
        limits: this.config.zipLimits,
      });
      files = entries.map((entry) => {
        const extension = /\.([a-zA-Z0-9]+)$/.exec(entry.entryName)?.[1]?.toLowerCase() ?? "";
        return {
          buffer: entry.buffer,
          originalFilename: entry.entryName,
          mimeType: inferDeclaredMimeTypeFromExtension(extension),
        };
      });
    } catch (error) {
      await this.fail(job, error);
      return;
    }

    job.markImporting(this.clock.now(), files.length);
    await this.jobRepository.save(job);

    try {
      const result = await this.importDceFilesUseCase.execute({
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        files,
        maxFileSizeBytes: this.config.maxFileSizeBytes,
        maxFilesPerImport: this.config.maxFilesPerImport,
        requestId: command.requestId,
      });
      job.markCompleted(result, this.clock.now());
      await this.jobRepository.save(job);
    } catch (error) {
      await this.fail(job, error);
    }
  }

  private async fail(job: Parameters<DceImportJobRepository["save"]>[0], error: unknown): Promise<void> {
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.error(`DCE ZIP import job ${job.id} failed: ${reason}`);
    job.markFailed(reason, this.clock.now());
    await this.jobRepository.save(job);
  }
}
