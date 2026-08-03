import { Inject, Injectable, Logger } from "@nestjs/common";
import { Readable } from "node:stream";
import { STORAGE_PROVIDER, type StorageProvider } from "../../../documents";
import { computeSha256, FILE_HASH_ALGORITHM } from "../../../../shared-kernel/file-hash";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { readStreamToBuffer } from "../../../../shared-kernel/read-stream-to-buffer";
import { ExportArtifact, type ExportManifest } from "../../domain/export-artifact";
import { ExportJob } from "../../domain/export-job.aggregate";
import type { ExportSectionSelection } from "../../domain/export-section-selection";
import { ExportFormat } from "../../domain/export-format";
import type { ExportTemplateConfig } from "../../domain/export-template-config";
import { DOCUMENT_RENDERER, type DocumentRendererPort } from "../ports/document-renderer";
import { PDF_RENDERER, type PdfRendererPort } from "../ports/pdf-renderer";
import { EXPORT_JOB_REPOSITORY, type ExportJobRepository } from "../ports/export-job.repository";
import { assembleExportDocument, type ResolvedSectionContent } from "./export-assembly.service";
import type { RenderableTheme } from "./renderable-document";

export type RunExportPipelineThemeInput = Readonly<{
  versionId: string;
  sourceLevel: string;
  accentColor?: string | undefined;
  fontFamily?: string | undefined;
  logoStorageKey?: string | undefined;
}>;

export type RunExportPipelineInput = Readonly<{
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  exportTemplateId: string;
  exportTemplateVersionId: string;
  documentType: string;
  mode: "PREVIEW" | "FINAL";
  format: string;
  templateConfig: ExportTemplateConfig;
  sections: readonly ExportSectionSelection[];
  resolvedContent: ReadonlyMap<string, ResolvedSectionContent>;
  basedOnExportJobId?: string | undefined;
  documentTitle: string;
  coverPage?: Readonly<{ buyerName?: string | undefined; clientName?: string | undefined; reference?: string | undefined; tenderTitle?: string | undefined }> | undefined;
  /** Mission Sprint 8A.2 (correction bugs #7/#8 "thème document pas toujours appliqué") — déjà
   *  résolu par l'use case appelant (voir ThemeResolver) : ce pipeline ne fait que charger les
   *  octets du logo depuis le stockage (seule E/S propre au thème) et conserver la preuve du
   *  thème utilisé sur le job (`themeVersionId`/`themeSourceLevel`). */
  theme?: RunExportPipelineThemeInput | undefined;
  createdBy: string;
  occurredAt: Date;
}>;

/**
 * Mission Sprint 8A §69 — orchestre le flux "transaction courte PENDING → rendu HORS transaction
 * → transaction courte succès/erreur" (jamais une transaction ouverte pendant le rendu DOCX/PDF ou
 * l'upload de stockage). Partagé par `PreviewExportUseCase` et `GenerateFinalExportUseCase` : la
 * SEULE différence entre les deux est en amont (résolution des sections, vérifications
 * d'éligibilité), jamais dans ce pipeline.
 */
@Injectable()
export class ExportRenderPipelineService {
  private readonly logger = new Logger(ExportRenderPipelineService.name);

  constructor(
    @Inject(EXPORT_JOB_REPOSITORY) private readonly exportJobRepository: ExportJobRepository,
    @Inject(DOCUMENT_RENDERER) private readonly documentRenderer: DocumentRendererPort,
    @Inject(PDF_RENDERER) private readonly pdfRenderer: PdfRendererPort,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async run(input: RunExportPipelineInput): Promise<{ job: ExportJob; artifact: ExportArtifact }> {
    const version = await this.exportJobRepository.nextVersion({
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      documentType: input.documentType,
      format: input.format,
    });

    const jobId = this.idGenerator.generate();
    const job = ExportJob.create({
      id: jobId,
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      tenderId: input.tenderId,
      exportTemplateId: input.exportTemplateId,
      exportTemplateVersionId: input.exportTemplateVersionId,
      documentType: input.documentType,
      mode: input.mode,
      format: input.format as ExportFormat,
      version,
      basedOnExportJobId: input.basedOnExportJobId,
      sections: input.sections,
      themeVersionId: input.theme?.versionId,
      themeSourceLevel: input.theme?.sourceLevel,
      createdBy: input.createdBy,
      occurredAt: input.occurredAt,
    });

    // Transaction courte n°1 (dans le repository) : PENDING + sections.
    await this.exportJobRepository.create(job);
    job.markGenerating();
    await this.exportJobRepository.markGenerating({ organizationId: input.organizationId, exportJobId: jobId });

    try {
      const theme: RenderableTheme | undefined = input.theme
        ? {
            accentColor: input.theme.accentColor,
            fontFamily: input.theme.fontFamily,
            logo: await this.loadThemeLogo(input.theme.logoStorageKey),
          }
        : undefined;

      const renderable = assembleExportDocument({
        documentTitle: input.documentTitle,
        config: input.templateConfig,
        sections: input.sections,
        resolvedContent: input.resolvedContent,
        coverPage: input.coverPage,
        version,
        date: input.occurredAt,
        isPreview: input.mode === "PREVIEW",
        theme,
      });

      // Rendu HORS transaction (mission §69 "ne garde jamais une transaction ouverte pendant le
      // rendu DOCX/PDF").
      const buffer = input.format === ExportFormat.Pdf ? await this.pdfRenderer.render(renderable) : await this.documentRenderer.render(renderable);
      const fileHash = computeSha256(buffer);
      const extension = input.format === ExportFormat.Pdf ? "pdf" : "docx";
      const mimeType = input.format === ExportFormat.Pdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const fileName = `TenderOS_${input.documentType}_v${version}.${extension}`;
      const storageKey = `exports/${input.organizationId}/${input.tenderId}/${jobId}.${extension}`;

      await this.storageProvider.put({ key: storageKey, content: Readable.from(buffer), contentType: mimeType, sizeBytes: buffer.length });

      const manifest: ExportManifest = {
        exportId: jobId,
        organizationId: input.organizationId,
        clientAccountId: input.clientAccountId,
        tenderId: input.tenderId,
        templateId: input.exportTemplateId,
        templateVersionId: input.exportTemplateVersionId,
        mode: input.mode,
        format: input.format,
        documentType: input.documentType,
        version,
        sections: input.sections.map((section) => ({
          sectionId: section.sectionId,
          label: input.templateConfig.sections.find((s) => s.id === section.sectionId)?.label ?? section.sectionId,
          sourceType: section.sourceType,
          generationId: section.generationId,
          pricingEstimateId: section.pricingEstimateId,
          pricingEstimateVersionNumber: section.pricingEstimateVersionNumber,
          validationStatus: section.validationStatus,
          order: section.order,
          deliverableProvenance: section.deliverableProvenance
            ? {
                deliverableId: section.deliverableProvenance.deliverableId,
                deliverableSectionId: section.deliverableProvenance.deliverableSectionId,
                deliverableRevisionId: section.deliverableProvenance.deliverableRevisionId,
                revisionNumber: section.deliverableProvenance.revisionNumber,
                validationStatus: section.deliverableProvenance.validationStatus,
                selectedBy: section.deliverableProvenance.selectedBy,
                selectedAt: section.deliverableProvenance.selectedAt.toISOString(),
              }
            : undefined,
        })),
        createdBy: input.createdBy,
        createdAt: input.occurredAt.toISOString(),
        filename: fileName,
        mimeType,
        fileSize: buffer.length,
        fileHash,
        hashAlgorithm: FILE_HASH_ALGORITHM,
        storageKey,
        warnings: [],
        errors: [],
      };

      const artifact = ExportArtifact.create({
        id: this.idGenerator.generate(),
        organizationId: input.organizationId,
        exportJobId: jobId,
        fileName,
        mimeType,
        fileSize: buffer.length,
        fileHash,
        hashAlgorithm: FILE_HASH_ALGORITHM,
        storageKey,
        manifest,
        warnings: [],
        errors: [],
        createdAt: input.occurredAt,
      });

      // Transaction courte n°2 : artefact + COMPLETED, atomiquement.
      await this.exportJobRepository.completeWithArtifact({ organizationId: input.organizationId, exportJobId: jobId, artifact, occurredAt: input.occurredAt });
      job.markCompleted(input.occurredAt);

      return { job, artifact };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "unknown rendering error";
      await this.exportJobRepository.markFailed({
        organizationId: input.organizationId,
        exportJobId: jobId,
        errorCode: "EXPORT_RENDER_FAILED",
        errorMessage: errorMessage.slice(0, 500),
        occurredAt: input.occurredAt,
      });
      throw error;
    }
  }

  /** Best-effort (mission Sprint 8A.2 bugs #7/#8) — un logo manquant ou illisible ne doit jamais
   *  faire échouer un export par ailleurs valide, seulement produire un document sans logo (le
   *  reste du thème — accentColor/fontFamily — s'applique quand même). */
  private async loadThemeLogo(logoStorageKey: string | undefined): Promise<{ buffer: Buffer; mimeType: string } | undefined> {
    if (!logoStorageKey) return undefined;
    try {
      const [metadata, stream] = await Promise.all([
        this.storageProvider.getMetadata(logoStorageKey),
        this.storageProvider.openReadStream(logoStorageKey),
      ]);
      const buffer = await readStreamToBuffer(stream);
      return { buffer, mimeType: metadata?.contentType ?? "image/png" };
    } catch (error) {
      this.logger.warn(`Failed to load theme logo "${logoStorageKey}" (rendering will continue without it): ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }
}
