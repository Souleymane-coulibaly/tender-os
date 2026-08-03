import { Inject, Injectable } from "@nestjs/common";
import { DCE_DOCUMENT_REPOSITORY, DCE_REPOSITORY, type DceDocumentRepository, type DceRepository } from "../../../dce";
import { GetTenderUseCase } from "../../../tenders";
import { DocumentExtractionNotFoundError } from "../../domain/extraction-errors";
import { ExtractionPermission } from "../../domain/extraction-permission";
import { assertHasExtractionPermission } from "../policies/extraction-authorization.policy";
import { DOCUMENT_EXTRACTION_REPOSITORY, type DocumentExtractionRepository } from "../ports/document-extraction.repository";
import { toDocumentExtractionSummary, type DocumentExtractionSummary } from "../dtos";

export type GetDocumentExtractionQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  documentId: string;
  actorId: string;
  actorRole: string;
}>;

/** Lecture de suivi (mission Sprint 3 §17) — même chaîne d'autorisation que le déclenchement,
 *  jamais un accès direct par documentId seul : un acteur d'une autre organisation, ou dont le
 *  Tender/DCE ne correspond pas, ne doit jamais pouvoir lire le statut/les métadonnées. */
@Injectable()
export class GetDocumentExtractionUseCase {
  constructor(
    @Inject(DOCUMENT_EXTRACTION_REPOSITORY) private readonly extractionRepository: DocumentExtractionRepository,
    @Inject(DCE_REPOSITORY) private readonly dceRepository: DceRepository,
    @Inject(DCE_DOCUMENT_REPOSITORY) private readonly dceDocumentRepository: DceDocumentRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
  ) {}

  async execute(query: GetDocumentExtractionQuery): Promise<DocumentExtractionSummary> {
    assertHasExtractionPermission(query.actorRole, ExtractionPermission.Read);

    await this.getTenderUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
    });

    const dce = await this.dceRepository.findByTenderId({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });
    if (!dce) {
      throw new DocumentExtractionNotFoundError();
    }

    const link = await this.dceDocumentRepository.findByDceIdAndDocumentId({
      organizationId: query.organizationId,
      dceId: dce.id.value,
      documentId: query.documentId,
    });
    if (!link) {
      throw new DocumentExtractionNotFoundError();
    }

    const extraction = await this.extractionRepository.findByDocumentId({
      organizationId: query.organizationId,
      documentId: query.documentId,
    });
    if (!extraction) {
      throw new DocumentExtractionNotFoundError();
    }

    return toDocumentExtractionSummary(extraction);
  }
}
