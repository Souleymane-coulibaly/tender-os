import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { PDF_RENDERER, type PdfRendererPort } from "../../../export";
import { GetTenderUseCase } from "../../../tenders";
import { AdministrativeDocumentType } from "../../domain/administrative-document-type";
import { SubcontractorDeclarationNotFoundError } from "../../domain/errors";
import { buildSubcontractorDeclarationRenderableDocument } from "../services/renderable-document-builders/subcontractor-declaration-renderable-document.builder";
import { AdministrativeGeneratedDocumentService } from "../services/administrative-generated-document.service";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import type { AdministrativeDocumentSummary } from "../dtos";
import { SUBCONTRACTOR_DECLARATION_REPOSITORY, type SubcontractorDeclarationRepository } from "../ports/subcontractor-declaration.repository";

export type GenerateSubcontractorDeclarationDocumentCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; subcontractorDeclarationId: string }>;

/** Sprint 8C Phase 3 — génère le PDF du DC4 pour UNE déclaration de sous-traitance précise
 *  (plusieurs coexistent par Tender, mission §12 — jamais une seule). */
@Injectable()
export class GenerateSubcontractorDeclarationDocumentUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(SUBCONTRACTOR_DECLARATION_REPOSITORY) private readonly repository: SubcontractorDeclarationRepository,
    private readonly generatedDocumentService: AdministrativeGeneratedDocumentService,
    private readonly getTenderUseCase: GetTenderUseCase,
    @Inject(PDF_RENDERER) private readonly pdfRenderer: PdfRendererPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: GenerateSubcontractorDeclarationDocumentCommand): Promise<AdministrativeDocumentSummary> {
    const declaration = await this.repository.findById({ organizationId: command.organizationId, subcontractorDeclarationId: command.subcontractorDeclarationId });
    if (!declaration) throw new SubcontractorDeclarationNotFoundError();

    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: declaration.tenderId, permission: ClientPermission.ManageAdministrativeDocuments });

    const tender = await this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: declaration.tenderId, actorId: command.actorId, actorRole: command.actorRole });
    const pdfBuffer = await this.pdfRenderer.render(buildSubcontractorDeclarationRenderableDocument({ declaration, tenderTitle: tender.title }));

    const summary = await this.generatedDocumentService.attachGeneratedPdf({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: declaration.tenderId,
      documentType: AdministrativeDocumentType.Dc4,
      label: `DC4 — Déclaration de sous-traitance (${declaration.subcontractorName})`,
      existingAdministrativeDocumentId: declaration.administrativeDocumentId,
      pdfBuffer,
      fileNameBase: "dc4-declaration-sous-traitance",
    });

    if (declaration.administrativeDocumentId === undefined) {
      declaration.linkDocument({ administrativeDocumentId: summary.id, occurredAt: this.clock.now() });
      await this.repository.save(declaration);
    }

    return summary;
  }
}
