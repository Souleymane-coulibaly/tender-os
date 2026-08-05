import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { PDF_RENDERER, type PdfRendererPort } from "../../../export";
import { GetTenderUseCase } from "../../../tenders";
import { AdministrativeDocumentType } from "../../domain/administrative-document-type";
import { Dc2DeclarationHasNoVersionError, Dc2DeclarationNotFoundError } from "../../domain/errors";
import { buildDc2RenderableDocument } from "../services/renderable-document-builders/structured-capacity-statement-renderable-document.builder";
import { AdministrativeGeneratedDocumentService } from "../services/administrative-generated-document.service";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import type { AdministrativeDocumentSummary } from "../dtos";
import { ADMINISTRATIVE_DOCUMENT_REPOSITORY, type AdministrativeDocumentRepository } from "../ports/administrative-document.repository";
import { ADMINISTRATIVE_DOSSIER_REPOSITORY, type AdministrativeDossierRepository } from "../ports/administrative-dossier.repository";
import { DC2_DECLARATION_REPOSITORY, DC2_DECLARATION_VERSION_REPOSITORY, type Dc2DeclarationRepository, type Dc2DeclarationVersionRepository } from "../ports/dc2-declaration.repository";

export type GenerateDc2DocumentCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/** Sprint 8C Phase 3 — génère le PDF du DC2 à partir de la DERNIÈRE version (jamais recalculé pour
 *  une version antérieure). `Dc2Declaration` ne porte pas de `administrativeDocumentId` (agrégat
 *  Phase 2 non prévu pour la génération) : la coquille existante est retrouvée par type dans le
 *  dossier plutôt que stockée sur l'agrégat — jamais deux coquilles DC2 pour le même Tender, la
 *  déclaration elle-même étant déjà unique par Tender (mission §11). */
@Injectable()
export class GenerateDc2DocumentUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(DC2_DECLARATION_REPOSITORY) private readonly declarationRepository: Dc2DeclarationRepository,
    @Inject(DC2_DECLARATION_VERSION_REPOSITORY) private readonly versionRepository: Dc2DeclarationVersionRepository,
    @Inject(ADMINISTRATIVE_DOSSIER_REPOSITORY) private readonly dossierRepository: AdministrativeDossierRepository,
    @Inject(ADMINISTRATIVE_DOCUMENT_REPOSITORY) private readonly documentRepository: AdministrativeDocumentRepository,
    private readonly generatedDocumentService: AdministrativeGeneratedDocumentService,
    private readonly getTenderUseCase: GetTenderUseCase,
    @Inject(PDF_RENDERER) private readonly pdfRenderer: PdfRendererPort,
  ) {}

  async execute(command: GenerateDc2DocumentCommand): Promise<AdministrativeDocumentSummary> {
    const declaration = await this.declarationRepository.findByTenderId({ organizationId: command.organizationId, tenderId: command.tenderId });
    if (!declaration) throw new Dc2DeclarationNotFoundError();
    if (declaration.currentVersionNumber < 1) throw new Dc2DeclarationHasNoVersionError();

    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId, permission: ClientPermission.ManageAdministrativeDocuments });

    const [tender, versions] = await Promise.all([
      this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole }),
      this.versionRepository.listByDeclaration({ organizationId: command.organizationId, dc2DeclarationId: declaration.id }),
    ]);
    const latestVersion = versions[versions.length - 1];
    if (!latestVersion) throw new Dc2DeclarationHasNoVersionError();

    const pdfBuffer = await this.pdfRenderer.render(buildDc2RenderableDocument({ data: latestVersion.data, version: latestVersion.version, tenderTitle: tender.title }));

    const existingShellId = await this.findExistingShellId(command.organizationId, command.tenderId);

    return this.generatedDocumentService.attachGeneratedPdf({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: command.tenderId,
      documentType: AdministrativeDocumentType.Dc2,
      label: `DC2 — Déclaration du candidat (v${latestVersion.version})`,
      existingAdministrativeDocumentId: existingShellId,
      pdfBuffer,
      fileNameBase: "dc2-declaration-candidat",
    });
  }

  private async findExistingShellId(organizationId: string, tenderId: string): Promise<string | undefined> {
    const dossier = await this.dossierRepository.findByTenderId({ organizationId, tenderId });
    if (!dossier) return undefined;
    const documents = await this.documentRepository.listByDossier({ organizationId, administrativeDossierId: dossier.id });
    return documents.find((d) => d.documentType === AdministrativeDocumentType.Dc2)?.id;
  }
}
