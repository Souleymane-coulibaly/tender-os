import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { GeneratedDocumentNotFoundError } from "../../domain/errors";
import { assertDocumentGenerationAccess } from "../policies/document-generation-authorization.policy";
import { toGeneratedDocumentSummary, type GeneratedDocumentSummary } from "../dtos";
import { GENERATED_DOCUMENT_REPOSITORY, type GeneratedDocumentRepository } from "../ports/generated-document.repository";

export type GetGeneratedDocumentQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; generatedDocumentId: string }>;

/**
 * Mission routes conceptuelles `GET /generated-documents/:id` et `GET /generated-documents/:id/
 * revisions` (servies ici par le même use case — jamais deux chemins de lecture divergents) : ni
 * l'une ni l'autre n'est préfixée par `tenderId` dans le chemin, contrairement à
 * `ListGeneratedDocumentsUseCase`. Le `tenderId` est donc résolu ICI, à partir de la lignée
 * chargée (scopée organisation), PUIS le ClientAccess de ce Tender est vérifié — jamais un accès
 * direct par id sans cette résolution complète (même motif anti-IDOR que
 * `DownloadGeneratedDocumentRevisionUseCase`).
 */
@Injectable()
export class GetGeneratedDocumentUseCase {
  constructor(
    @Inject(GENERATED_DOCUMENT_REPOSITORY) private readonly generatedDocumentRepository: GeneratedDocumentRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetGeneratedDocumentQuery): Promise<GeneratedDocumentSummary> {
    const generatedDocument = await this.generatedDocumentRepository.findById({ organizationId: query.organizationId, generatedDocumentId: query.generatedDocumentId });
    if (!generatedDocument) {
      throw new GeneratedDocumentNotFoundError();
    }

    await assertDocumentGenerationAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: query.organizationId,
      tenderId: generatedDocument.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadDocumentGeneration,
    });

    const revisions = await this.generatedDocumentRepository.listRevisions({ organizationId: query.organizationId, generatedDocumentId: generatedDocument.id });
    return toGeneratedDocumentSummary(generatedDocument, revisions);
  }
}
