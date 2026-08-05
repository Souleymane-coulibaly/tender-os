import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { PDF_RENDERER, type PdfRendererPort } from "../../../export";
import { GetTenderUseCase } from "../../../tenders";
import { AdministrativeDocumentType } from "../../domain/administrative-document-type";
import { EngagementActNotFoundError, EngagementActPricingNotFrozenError } from "../../domain/errors";
import { buildEngagementActRenderableDocument } from "../services/renderable-document-builders/engagement-act-renderable-document.builder";
import { AdministrativeGeneratedDocumentService } from "../services/administrative-generated-document.service";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import type { AdministrativeDocumentSummary } from "../dtos";
import { ENGAGEMENT_ACT_REPOSITORY, type EngagementActRepository } from "../ports/engagement-act.repository";

export type GenerateEngagementActDocumentCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/** Sprint 8C Phase 3 — refuse de générer tant qu'aucun montant n'est explicitement gelé (mission
 *  "jamais un montant implicite dans un document juridique") — le montant rendu est TOUJOURS
 *  `frozenAmountValue`, jamais un recalcul au moment de la génération. */
@Injectable()
export class GenerateEngagementActDocumentUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ENGAGEMENT_ACT_REPOSITORY) private readonly repository: EngagementActRepository,
    private readonly generatedDocumentService: AdministrativeGeneratedDocumentService,
    private readonly getTenderUseCase: GetTenderUseCase,
    @Inject(PDF_RENDERER) private readonly pdfRenderer: PdfRendererPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: GenerateEngagementActDocumentCommand): Promise<AdministrativeDocumentSummary> {
    const act = await this.repository.findByTenderId({ organizationId: command.organizationId, tenderId: command.tenderId });
    if (!act) throw new EngagementActNotFoundError();
    if (act.frozenAmountValue === undefined || act.frozenAmountCurrency === undefined) throw new EngagementActPricingNotFrozenError();

    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId, permission: ClientPermission.ManageAdministrativeDocuments });

    const tender = await this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole });
    const pdfBuffer = await this.pdfRenderer.render(buildEngagementActRenderableDocument({ act, tenderTitle: tender.title }));

    const summary = await this.generatedDocumentService.attachGeneratedPdf({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: command.tenderId,
      documentType: AdministrativeDocumentType.ActeEngagement,
      label: "Acte d'engagement",
      existingAdministrativeDocumentId: act.administrativeDocumentId,
      pdfBuffer,
      fileNameBase: "acte-engagement",
    });

    if (act.administrativeDocumentId === undefined) {
      act.linkDocument({ administrativeDocumentId: summary.id, occurredAt: this.clock.now() });
      await this.repository.save(act);
    }

    return summary;
  }
}
