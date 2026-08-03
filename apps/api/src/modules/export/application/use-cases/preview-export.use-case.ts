import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { ExportTemplateNotFoundError, NoActiveExportTemplateVersionError } from "../../domain/errors";
import { ExportMode } from "../../domain/export-mode";
import { toExportJobSummary, type ExportJobSummary } from "../dtos";
import { THEME_RESOLVER, type ThemeResolver } from "../ports/theme-resolver";
import { EXPORT_TEMPLATE_REPOSITORY, type ExportTemplateRepository } from "../ports/export-template.repository";
import { ExportRenderPipelineService, type RunExportPipelineThemeInput } from "../services/export-render-pipeline.service";
import { SectionContentResolverService, type SectionSelectionInput } from "../services/section-content-resolver.service";

export type PreviewExportCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  exportTemplateId: string;
  sections: readonly SectionSelectionInput[];
}>;

/**
 * Mission Sprint 8A §18/§21 — un aperçu n'approuve jamais, ne verrouille jamais, ne démarre jamais
 * de signature. Réutilise EXACTEMENT le même pipeline de rendu qu'un export final (mission "jamais
 * un second chemin de rendu") — seule la sélection de sections diffère (choisie librement ici,
 * jamais figée).
 */
@Injectable()
export class PreviewExportUseCase {
  private readonly logger = new Logger(PreviewExportUseCase.name);

  constructor(
    @Inject(EXPORT_TEMPLATE_REPOSITORY) private readonly exportTemplateRepository: ExportTemplateRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly sectionContentResolver: SectionContentResolverService,
    private readonly exportRenderPipeline: ExportRenderPipelineService,
    @Inject(CLOCK) private readonly clock: Clock,
    // Optionnel — même discipline que ProcessGenerationUseCase/routingPolicyResolver : absent
    // (ExportThemeResolverBridgeModule non importé), l'export continue sans thème plutôt que
    // d'échouer (mission Sprint 8A.2 "aucune régression possible par omission").
    @Optional() @Inject(THEME_RESOLVER) private readonly themeResolver?: ThemeResolver,
  ) {}

  private async resolveTheme(input: { organizationId: string; clientAccountId: string; tenderId: string }): Promise<RunExportPipelineThemeInput | undefined> {
    if (!this.themeResolver) return undefined;
    try {
      const resolved = await this.themeResolver.resolveActive(input);
      return resolved
        ? { versionId: resolved.versionId, sourceLevel: resolved.sourceLevel, accentColor: resolved.accentColor, fontFamily: resolved.fontFamily, logoStorageKey: resolved.logoStorageKey }
        : undefined;
    } catch (error) {
      this.logger.warn(`Theme resolution failed (rendering will continue without a theme): ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  async execute(command: PreviewExportCommand): Promise<ExportJobSummary> {
    const tender = await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });

    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageExport,
    });

    const found = await this.exportTemplateRepository.findById({ organizationId: command.organizationId, exportTemplateId: command.exportTemplateId });
    if (!found) {
      throw new ExportTemplateNotFoundError();
    }
    if (!found.activeVersion) {
      throw new NoActiveExportTemplateVersionError();
    }

    const occurredAt = this.clock.now();
    const { sections, resolvedContent } = await this.sectionContentResolver.resolve({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientAccountId: tender.clientAccountId,
      selections: command.sections,
      selectedBy: command.actorId,
      occurredAt,
    });

    const theme = await this.resolveTheme({ organizationId: command.organizationId, clientAccountId: tender.clientAccountId, tenderId: command.tenderId });

    const { job, artifact } = await this.exportRenderPipeline.run({
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      tenderId: command.tenderId,
      exportTemplateId: command.exportTemplateId,
      exportTemplateVersionId: found.activeVersion.id,
      documentType: found.template.documentType,
      mode: ExportMode.Preview,
      format: found.activeVersion.format,
      templateConfig: found.activeVersion.config,
      sections,
      resolvedContent,
      documentTitle: tender.title,
      coverPage: { buyerName: tender.buyerName, reference: tender.reference, tenderTitle: tender.title },
      theme,
      createdBy: command.actorId,
      occurredAt,
    });

    return toExportJobSummary(job, artifact);
  }
}
