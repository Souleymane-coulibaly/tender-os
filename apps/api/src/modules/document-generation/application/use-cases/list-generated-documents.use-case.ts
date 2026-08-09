import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { assertDocumentGenerationAccess } from "../policies/document-generation-authorization.policy";
import { toGeneratedDocumentSummary, type GeneratedDocumentSummary } from "../dtos";
import { GENERATED_DOCUMENT_REPOSITORY, type GeneratedDocumentRepository } from "../ports/generated-document.repository";

export type ListGeneratedDocumentsQuery = Readonly<{ organizationId: string; tenderId: string; actorId: string; actorRole: string }>;

@Injectable()
export class ListGeneratedDocumentsUseCase {
  constructor(
    @Inject(GENERATED_DOCUMENT_REPOSITORY) private readonly generatedDocumentRepository: GeneratedDocumentRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListGeneratedDocumentsQuery): Promise<readonly GeneratedDocumentSummary[]> {
    await assertDocumentGenerationAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadDocumentGeneration,
    });

    const generatedDocuments = await this.generatedDocumentRepository.list({ organizationId: query.organizationId, tenderId: query.tenderId });
    return generatedDocuments.map((generatedDocument) => toGeneratedDocumentSummary(generatedDocument));
  }
}
