import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { PDF_RENDERER, type PdfRendererPort } from "../../../export";
import { GetTenderUseCase } from "../../../tenders";
import { AdministrativeDocumentType } from "../../domain/administrative-document-type";
import { DumeDeclarationHasNoVersionError, DumeDeclarationNotFoundError } from "../../domain/errors";
import { buildDumeRenderableDocument } from "../services/renderable-document-builders/structured-capacity-statement-renderable-document.builder";
import { AdministrativeGeneratedDocumentService } from "../services/administrative-generated-document.service";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import type { AdministrativeDocumentSummary } from "../dtos";
import { ADMINISTRATIVE_DOCUMENT_REPOSITORY, type AdministrativeDocumentRepository } from "../ports/administrative-document.repository";
import { ADMINISTRATIVE_DOSSIER_REPOSITORY, type AdministrativeDossierRepository } from "../ports/administrative-dossier.repository";
import { DUME_DECLARATION_REPOSITORY, DUME_DECLARATION_VERSION_REPOSITORY, type DumeDeclarationRepository, type DumeDeclarationVersionRepository } from "../ports/dume-declaration.repository";

export type GenerateDumeDocumentCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/** Sprint 8C Phase 3 — mise en forme PDF lisible du DUME (jamais une prétention de conformité au
 *  schéma d'échange ESPD officiel — voir `GetDumeXmlDraftUseCase` pour l'export XML séparé,
 *  explicitement étiqueté "brouillon non officiel"). Même motif de recherche de coquille que DC2
 *  (`Dc2Declaration`/`DumeDeclaration` ne portent pas `administrativeDocumentId`). */
@Injectable()
export class GenerateDumeDocumentUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(DUME_DECLARATION_REPOSITORY) private readonly declarationRepository: DumeDeclarationRepository,
    @Inject(DUME_DECLARATION_VERSION_REPOSITORY) private readonly versionRepository: DumeDeclarationVersionRepository,
    @Inject(ADMINISTRATIVE_DOSSIER_REPOSITORY) private readonly dossierRepository: AdministrativeDossierRepository,
    @Inject(ADMINISTRATIVE_DOCUMENT_REPOSITORY) private readonly documentRepository: AdministrativeDocumentRepository,
    private readonly generatedDocumentService: AdministrativeGeneratedDocumentService,
    private readonly getTenderUseCase: GetTenderUseCase,
    @Inject(PDF_RENDERER) private readonly pdfRenderer: PdfRendererPort,
  ) {}

  async execute(command: GenerateDumeDocumentCommand): Promise<AdministrativeDocumentSummary> {
    const declaration = await this.declarationRepository.findByTenderId({ organizationId: command.organizationId, tenderId: command.tenderId });
    if (!declaration) throw new DumeDeclarationNotFoundError();
    if (declaration.currentVersionNumber < 1) throw new DumeDeclarationHasNoVersionError();

    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId, permission: ClientPermission.ManageAdministrativeDocuments });

    const [tender, versions] = await Promise.all([
      this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole }),
      this.versionRepository.listByDeclaration({ organizationId: command.organizationId, dumeDeclarationId: declaration.id }),
    ]);
    const latestVersion = versions[versions.length - 1];
    if (!latestVersion) throw new DumeDeclarationHasNoVersionError();

    const pdfBuffer = await this.pdfRenderer.render(buildDumeRenderableDocument({ data: latestVersion.data, version: latestVersion.version, tenderTitle: tender.title }));

    const existingShellId = await this.findExistingShellId(command.organizationId, command.tenderId);

    return this.generatedDocumentService.attachGeneratedPdf({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: command.tenderId,
      documentType: AdministrativeDocumentType.Dume,
      label: `DUME (v${latestVersion.version})`,
      existingAdministrativeDocumentId: existingShellId,
      pdfBuffer,
      fileNameBase: "dume",
    });
  }

  private async findExistingShellId(organizationId: string, tenderId: string): Promise<string | undefined> {
    const dossier = await this.dossierRepository.findByTenderId({ organizationId, tenderId });
    if (!dossier) return undefined;
    const documents = await this.documentRepository.listByDossier({ organizationId, administrativeDossierId: dossier.id });
    return documents.find((d) => d.documentType === AdministrativeDocumentType.Dume)?.id;
  }
}
