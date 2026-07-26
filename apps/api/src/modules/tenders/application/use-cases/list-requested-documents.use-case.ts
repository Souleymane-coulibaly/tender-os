import { Inject, Injectable } from "@nestjs/common";
import { TenderPermission } from "../../domain/tender-permission";
import { toRequestedDocumentSummary, type RequestedDocumentSummary } from "../dtos";
import {
  REQUESTED_DOCUMENT_REPOSITORY,
  type RequestedDocumentRepository,
} from "../ports/requested-document.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type ListRequestedDocumentsQuery = Readonly<{ organizationId: string; tenderId: string; actorRole: string }>;

@Injectable()
export class ListRequestedDocumentsUseCase {
  constructor(
    @Inject(REQUESTED_DOCUMENT_REPOSITORY) private readonly documentRepository: RequestedDocumentRepository,
  ) {}

  async execute(query: ListRequestedDocumentsQuery): Promise<RequestedDocumentSummary[]> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const documents = await this.documentRepository.listByTender({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });

    return documents.sort((a, b) => a.displayOrder - b.displayOrder).map(toRequestedDocumentSummary);
  }
}
