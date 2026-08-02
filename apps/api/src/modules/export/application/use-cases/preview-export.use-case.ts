import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { ExportTemplateNotFoundError, NoActiveExportTemplateVersionError } from "../../domain/errors";
import { ExportMode } from "../../domain/export-mode";
import { toExportJobSummary, type ExportJobSummary } from "../dtos";
import { EXPORT_TEMPLATE_REPOSITORY, type ExportTemplateRepository } from "../ports/export-template.repository";
import { ExportRenderPipelineService } from "../services/export-render-pipeline.service";
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
  constructor(
    @Inject(EXPORT_TEMPLATE_REPOSITORY) private readonly exportTemplateRepository: ExportTemplateRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly sectionContentResolver: SectionContentResolverService,
    private readonly exportRenderPipeline: ExportRenderPipelineService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

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
      createdBy: command.actorId,
      occurredAt,
    });

    return toExportJobSummary(job, artifact);
  }
}
