import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import {
  EXPORT_TEMPLATE_REPOSITORY,
  ExportSectionSource,
  PreviewExportUseCase,
  type ExportJobSummary,
  type ExportTemplateRepository,
  type SectionSelectionInput,
} from "../../../export";
import { GetTenderUseCase } from "../../../tenders";
import { isStructuredDeliverableType } from "../../domain/deliverable-type";
import { DeliverableNotFoundError, DeliverableTemplateNotFoundError, UnsupportedReadOnlyDeliverableError } from "../../domain/errors";
import { DELIVERABLE_REPOSITORY, type DeliverableRepository } from "../ports/deliverable.repository";
import { DELIVERABLE_EXPORT_SELECTION_REPOSITORY, type DeliverableExportSelectionRepository } from "../ports/deliverable-export-selection.repository";
import { DELIVERABLE_REVISION_REPOSITORY, type DeliverableRevisionRepository } from "../ports/deliverable-revision.repository";
import { DELIVERABLE_SECTION_REPOSITORY, type DeliverableSectionRepository } from "../ports/deliverable-section.repository";

export type PreviewDeliverableCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; deliverableId: string }>;

/**
 * Mission Sprint 8A.1 §11/§12 — assemble l'aperçu d'un livrable structuré via le MÊME pipeline de
 * rendu que le Sprint 8A ("jamais un second moteur DOCX/PDF"). Pour chaque section : privilégie la
 * révision explicitement sélectionnée pour l'export (`DeliverableExportSelection`, garantie
 * VALIDÉE par le domaine) ; à défaut, replie sur la révision la PLUS RÉCENTE (même non validée) —
 * un APERÇU n'approuve rien et ne verrouille rien (mission Export §18 "un aperçu n'approuve
 * jamais"), contrairement au figeage FINAL qui reste entièrement porté par
 * `ApproveFinalVersionUseCase` (Validation, Sprint 8A bis, inchangé) une fois cet aperçu approuvé.
 */
@Injectable()
export class PreviewDeliverableUseCase {
  constructor(
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverableRepository: DeliverableRepository,
    @Inject(DELIVERABLE_SECTION_REPOSITORY) private readonly sectionRepository: DeliverableSectionRepository,
    @Inject(DELIVERABLE_REVISION_REPOSITORY) private readonly revisionRepository: DeliverableRevisionRepository,
    @Inject(DELIVERABLE_EXPORT_SELECTION_REPOSITORY) private readonly exportSelectionRepository: DeliverableExportSelectionRepository,
    @Inject(EXPORT_TEMPLATE_REPOSITORY) private readonly exportTemplateRepository: ExportTemplateRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly previewExportUseCase: PreviewExportUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: PreviewDeliverableCommand): Promise<ExportJobSummary> {
    const deliverable = await this.deliverableRepository.findById({ organizationId: command.organizationId, deliverableId: command.deliverableId });
    if (!deliverable) {
      throw new DeliverableNotFoundError();
    }
    if (!isStructuredDeliverableType(deliverable.type)) {
      throw new UnsupportedReadOnlyDeliverableError("only TECHNICAL_MEMO/EXECUTIVE_SUMMARY deliverables can be previewed through this pipeline");
    }

    const tender = await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: deliverable.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });
    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageDeliverable,
    });

    // Mission §5 — le "template" utilisé pour le RENDU physique reste celui du Sprint 8A
    // (`ExportTemplate`, mise en page/couverture/pagination), un concept distinct du
    // `DeliverableTemplate` (structure des sections/instructions IA) : jamais confondus, jamais
    // fusionnés silencieusement.
    const exportTemplates = await this.exportTemplateRepository.list({ organizationId: command.organizationId });
    const matching = exportTemplates.find((t) => t.template.documentType === deliverable.type && t.activeVersion);
    if (!matching) {
      throw new DeliverableTemplateNotFoundError();
    }

    const sections = await this.sectionRepository.listByDeliverable({ organizationId: command.organizationId, deliverableId: deliverable.id });
    const visibleSections = sections.filter((s) => !s.hidden);

    const occurredAt = this.clock.now();
    const sectionInputs: SectionSelectionInput[] = [];
    for (const section of visibleSections) {
      const selection = await this.exportSelectionRepository.findBySection({ organizationId: command.organizationId, deliverableSectionId: section.id });
      const revision = selection
        ? await this.revisionRepository.findById({ organizationId: command.organizationId, revisionId: selection.deliverableRevisionId })
        : await this.revisionRepository.findLatestBySection({ organizationId: command.organizationId, deliverableSectionId: section.id });
      if (!revision) continue;
      sectionInputs.push({
        sectionId: section.code,
        sourceType: ExportSectionSource.Manual,
        manualContent: revision.contentText,
        manualBlocks: revision.contentStructured,
        // Correctif audit Codex P1-001 — provenance explicite : quelle révision EXACTE de quelle
        // section de quel livrable a produit ce contenu, et si elle a été explicitement
        // sélectionnée pour l'export (selectedBy/selectedAt de la sélection) ou reprise en repli
        // sur la plus récente (selectedBy/selectedAt de CET aperçu, jamais fabriqués).
        deliverableProvenance: {
          deliverableId: deliverable.id,
          deliverableSectionId: section.id,
          deliverableRevisionId: revision.id,
          revisionNumber: revision.revisionNumber,
          validationStatus: revision.status,
          selectedBy: selection?.selectedBy ?? command.actorId,
          selectedAt: selection?.selectedAt ?? occurredAt,
        },
      });
    }

    return this.previewExportUseCase.execute({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: deliverable.tenderId,
      exportTemplateId: matching.template.id,
      sections: sectionInputs,
    });
  }
}
