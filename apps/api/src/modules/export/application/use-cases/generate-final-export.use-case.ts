import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { GetTenderUseCase } from "../../../tenders";
import { ExportBlockedError, ExportJobNotFoundError } from "../../domain/errors";
import { ExportMode } from "../../domain/export-mode";
import { toExportJobSummary, type ExportJobSummary } from "../dtos";
import { EXPORT_JOB_REPOSITORY, type ExportJobRepository } from "../ports/export-job.repository";
import { EXPORT_TEMPLATE_REPOSITORY, type ExportTemplateRepository } from "../ports/export-template.repository";
import { THEME_RESOLVER, type ThemeResolver } from "../ports/theme-resolver";
import { ExportRenderPipelineService, type RunExportPipelineThemeInput } from "../services/export-render-pipeline.service";
import { SectionContentResolverService } from "../services/section-content-resolver.service";

export type GenerateFinalExportCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  /** L'aperçu approuvé à figer — jamais une resélection libre (mission §32). */
  basedOnExportJobId: string;
  /** Hash du manifest de l'aperçu approuvé, transmis par l'appelant (Validation) après vérification
   *  — défense en profondeur contre toute dérive entre l'approbation et ce figeage (mission
   *  §32/§39 "aucune substitution silencieuse d'une version validée"). */
  expectedManifestHash: string;
}>;

/**
 * Mission Sprint 8A §14/§19/§22 — jamais appelé directement par un contrôleur HTTP exposé à
 * l'acteur final : appelé UNIQUEMENT par `ApproveFinalVersionUseCase` (module Validation) juste
 * après la création d'une `FinalApproval` active, avec les données déjà vérifiées (jamais une
 * dépendance d'Export vers Validation — évite tout cycle de modules, même motif que
 * Generation → Analysis, Pricing → Tenders/ClientPortfolio : toujours un seul sens).
 */
@Injectable()
export class GenerateFinalExportUseCase {
  private readonly logger = new Logger(GenerateFinalExportUseCase.name);

  constructor(
    @Inject(EXPORT_JOB_REPOSITORY) private readonly exportJobRepository: ExportJobRepository,
    @Inject(EXPORT_TEMPLATE_REPOSITORY) private readonly exportTemplateRepository: ExportTemplateRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly exportRenderPipeline: ExportRenderPipelineService,
    private readonly sectionContentResolver: SectionContentResolverService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Optional() @Inject(THEME_RESOLVER) private readonly themeResolver?: ThemeResolver,
  ) {}

  /** Mission Sprint 8A.2 (correction bugs #7/#8 "l'aperçu doit correspondre exactement à l'export
   *  final") — réutilise TOUJOURS le thème déjà figé sur l'aperçu approuvé (`themeVersionId`/
   *  `themeSourceLevel`), jamais une nouvelle résolution par hiérarchie (même discipline que
   *  `exportTemplateVersionId` juste au-dessus) : un logo/une couleur changés côté organisation
   *  entre l'approbation et le figeage ne doivent jamais faire dériver silencieusement le FINAL. */
  private async resolveFrozenTheme(input: { organizationId: string; themeVersionId?: string | undefined; themeSourceLevel?: string | undefined }): Promise<RunExportPipelineThemeInput | undefined> {
    if (!this.themeResolver || !input.themeVersionId) return undefined;
    try {
      const resolved = await this.themeResolver.findByVersionId({ organizationId: input.organizationId, versionId: input.themeVersionId });
      if (!resolved) return undefined;
      return {
        versionId: resolved.versionId,
        sourceLevel: input.themeSourceLevel ?? resolved.sourceLevel,
        accentColor: resolved.accentColor,
        fontFamily: resolved.fontFamily,
        logoStorageKey: resolved.logoStorageKey,
      };
    } catch (error) {
      this.logger.warn(`Failed to reload the theme frozen on the approved preview (rendering will continue without it): ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  async execute(command: GenerateFinalExportCommand): Promise<ExportJobSummary> {
    const found = await this.exportJobRepository.findById({ organizationId: command.organizationId, exportJobId: command.basedOnExportJobId });
    if (!found || !found.artifact) {
      throw new ExportJobNotFoundError();
    }
    const { job: previewJob, artifact: previewArtifact } = found;

    if (previewJob.mode !== ExportMode.Preview) {
      throw new ExportBlockedError("only a PREVIEW export can be frozen into a FINAL export");
    }
    if (previewArtifact.fileHash !== command.expectedManifestHash && previewArtifact.manifest.fileHash !== command.expectedManifestHash) {
      throw new ExportBlockedError("the approved manifest no longer matches the preview export — re-run validation and approval");
    }

    const templateVersion = await this.exportTemplateRepository.findVersionById({
      organizationId: command.organizationId,
      versionId: previewJob.exportTemplateVersionId,
    });
    if (!templateVersion) {
      throw new ExportBlockedError("the export template version used for the approved preview is no longer available");
    }

    const tender = await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });

    const occurredAt = this.clock.now();
    // La SÉLECTION est copiée verbatim depuis l'aperçu (jamais reconstruite) ; seul le contenu
    // associé est relu une dernière fois sur les MÊMES références (mission §32 "aucune
    // substitution silencieuse d'une version validée" — la vérification de non-dérive métier
    // reste la responsabilité de Validation avant l'approbation, jamais répétée ici).
    const resolvedContent = await this.sectionContentResolver.resolveContentOnly({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      sections: previewJob.sections,
    });

    const theme = await this.resolveFrozenTheme({
      organizationId: command.organizationId,
      themeVersionId: previewJob.themeVersionId,
      themeSourceLevel: previewJob.themeSourceLevel,
    });

    const { job, artifact } = await this.exportRenderPipeline.run({
      organizationId: command.organizationId,
      clientAccountId: previewJob.clientAccountId,
      tenderId: command.tenderId,
      exportTemplateId: previewJob.exportTemplateId,
      exportTemplateVersionId: previewJob.exportTemplateVersionId,
      documentType: previewJob.documentType,
      mode: ExportMode.Final,
      format: previewJob.format,
      templateConfig: templateVersion.config,
      sections: previewJob.sections,
      resolvedContent,
      basedOnExportJobId: previewJob.id,
      documentTitle: tender.title,
      coverPage: { buyerName: tender.buyerName, reference: tender.reference, tenderTitle: tender.title },
      theme,
      createdBy: command.actorId,
      occurredAt,
    });

    return toExportJobSummary(job, artifact);
  }
}
