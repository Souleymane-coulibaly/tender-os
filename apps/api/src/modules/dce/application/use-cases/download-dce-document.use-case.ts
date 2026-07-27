import { Inject, Injectable } from "@nestjs/common";
import { DownloadDocumentVersionUseCase, type DocumentDownload } from "../../../documents";
import { DceDocumentNotFoundError, DceNotFoundError } from "../../domain/errors";
import { DcePermission } from "../../domain/dce-permission";
import { assertHasDcePermission } from "../policies/dce-authorization.policy";
import { DCE_DOCUMENT_REPOSITORY, type DceDocumentRepository } from "../ports/dce-document.repository";
import { DCE_REPOSITORY, type DceRepository } from "../ports/dce.repository";

export type DownloadDceDocumentQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  documentId: string;
  actorRole: string;
}>;

/**
 * Délègue entièrement l'accès au contenu physique à Documents (flux ou URL signée, jamais la clé
 * de stockage — conception §M déjà appliquée par Documents). La vérification préalable que
 * `documentId` appartient bien au DCE de CE Tender (via DceDocument) est essentielle : sans elle,
 * un documentId valide de la même organisation mais appartenant au DCE d'un AUTRE Tender serait
 * téléchargeable via ces routes (Documents ne scope que par organizationId, jamais par Tender).
 */
@Injectable()
export class DownloadDceDocumentUseCase {
  constructor(
    @Inject(DCE_REPOSITORY) private readonly dceRepository: DceRepository,
    @Inject(DCE_DOCUMENT_REPOSITORY) private readonly dceDocumentRepository: DceDocumentRepository,
    private readonly downloadDocumentVersionUseCase: DownloadDocumentVersionUseCase,
  ) {}

  async execute(query: DownloadDceDocumentQuery): Promise<DocumentDownload> {
    assertHasDcePermission(query.actorRole, DcePermission.Download);

    const dce = await this.dceRepository.findByTenderId({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });
    if (!dce) {
      throw new DceNotFoundError();
    }

    const link = await this.dceDocumentRepository.findByDceIdAndDocumentId({
      organizationId: query.organizationId,
      dceId: dce.id.value,
      documentId: query.documentId,
    });
    if (!link) {
      throw new DceDocumentNotFoundError();
    }

    return this.downloadDocumentVersionUseCase.execute({
      organizationId: query.organizationId,
      documentId: query.documentId,
      actorRole: query.actorRole,
    });
  }
}
