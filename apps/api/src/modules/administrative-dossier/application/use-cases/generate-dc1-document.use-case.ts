import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { PDF_RENDERER, type PdfRendererPort } from "../../../export";
import { GetTenderUseCase } from "../../../tenders";
import { AdministrativeDocumentType } from "../../domain/administrative-document-type";
import { Dc1DeclarationNotFoundError } from "../../domain/errors";
import { buildDc1RenderableDocument } from "../services/renderable-document-builders/dc1-renderable-document.builder";
import { AdministrativeGeneratedDocumentService } from "../services/administrative-generated-document.service";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import type { AdministrativeDocumentSummary } from "../dtos";
import { CONSORTIUM_REPOSITORY, type ConsortiumRepository } from "../ports/consortium.repository";
import { DC1_DECLARATION_REPOSITORY, type Dc1DeclarationRepository } from "../ports/dc1-declaration.repository";

export type GenerateDc1DocumentCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/** Sprint 8C Phase 3 — génère le PDF du DC1 à partir des données déjà structurées (Phase 2), le
 *  stocke et l'attache à la pièce administrative correspondante (créée si absente, réutilisée
 *  sinon — jamais une seconde coquille pour la même déclaration). */
@Injectable()
export class GenerateDc1DocumentUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(DC1_DECLARATION_REPOSITORY) private readonly dc1Repository: Dc1DeclarationRepository,
    @Inject(CONSORTIUM_REPOSITORY) private readonly consortiumRepository: ConsortiumRepository,
    private readonly generatedDocumentService: AdministrativeGeneratedDocumentService,
    private readonly getTenderUseCase: GetTenderUseCase,
    @Inject(PDF_RENDERER) private readonly pdfRenderer: PdfRendererPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: GenerateDc1DocumentCommand): Promise<AdministrativeDocumentSummary> {
    const dc1 = await this.dc1Repository.findByTenderId({ organizationId: command.organizationId, tenderId: command.tenderId });
    if (!dc1) throw new Dc1DeclarationNotFoundError();

    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId, permission: ClientPermission.ManageAdministrativeDocuments });

    const tender = await this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole });
    const consortium = dc1.consortiumId ? (await this.consortiumRepository.findById({ organizationId: command.organizationId, consortiumId: dc1.consortiumId })) ?? undefined : undefined;

    const pdfBuffer = await this.pdfRenderer.render(buildDc1RenderableDocument({ dc1, consortium, tenderTitle: tender.title }));

    const summary = await this.generatedDocumentService.attachGeneratedPdf({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: command.tenderId,
      documentType: AdministrativeDocumentType.Dc1,
      label: "DC1 — Lettre de candidature",
      existingAdministrativeDocumentId: dc1.administrativeDocumentId,
      pdfBuffer,
      fileNameBase: "dc1-lettre-candidature",
    });

    if (dc1.administrativeDocumentId === undefined) {
      dc1.linkDocument({ administrativeDocumentId: summary.id, occurredAt: this.clock.now() });
      await this.dc1Repository.save(dc1);
    }

    return summary;
  }
}
