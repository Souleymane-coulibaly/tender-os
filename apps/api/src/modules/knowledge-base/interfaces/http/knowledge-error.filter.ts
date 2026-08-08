import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  // Erreurs cross-module réelles : Knowledge Base délègue à Documents (CreateDocumentWithFirstVersionUseCase)
  // et à Extraction (ExtractDocumentContentUseCase, contrat public Sprint 5) et laisse leurs
  // erreurs remonter telles quelles.
  DOCUMENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  UNSUPPORTED_FILE_TYPE: HttpStatus.UNPROCESSABLE_ENTITY,
  EMPTY_FILE: HttpStatus.UNPROCESSABLE_ENTITY,
  FILE_TOO_LARGE: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_FILENAME: HttpStatus.UNPROCESSABLE_ENTITY,

  INVALID_KNOWLEDGE_CATEGORY: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_KNOWLEDGE_ENTRY_STATUS: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_KNOWLEDGE_ENTRY_STATUS_TRANSITION: HttpStatus.CONFLICT,
  INVALID_KNOWLEDGE_SOURCE_TYPE: HttpStatus.UNPROCESSABLE_ENTITY,
  KNOWLEDGE_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  KNOWLEDGE_SPACE_NOT_FOUND: HttpStatus.NOT_FOUND,
  KNOWLEDGE_ENTRY_NOT_FOUND: HttpStatus.NOT_FOUND,
  KNOWLEDGE_ENTRY_ARCHIVED: HttpStatus.CONFLICT,
  KNOWLEDGE_ENTRY_NOT_ARCHIVED: HttpStatus.CONFLICT,
  KNOWLEDGE_ENTRY_VERSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  KNOWLEDGE_DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  KNOWLEDGE_DOCUMENT_NOT_REPROCESSABLE: HttpStatus.CONFLICT,
  KNOWLEDGE_METADATA_VALIDATION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
  DUPLICATE_KNOWLEDGE_TAG: HttpStatus.CONFLICT,
  KNOWLEDGE_TAG_NOT_FOUND: HttpStatus.NOT_FOUND,
  KNOWLEDGE_PROVENANCE_VALIDATION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
  KNOWLEDGE_ENTRY_NOT_READY_FOR_VALIDATION: HttpStatus.CONFLICT,
  KNOWLEDGE_ENTRY_ALREADY_VALIDATED: HttpStatus.CONFLICT,
  KNOWLEDGE_ENTRY_PROMOTION_REQUIRES_VALIDATED_CHECKLIST_ITEM: HttpStatus.CONFLICT,

  // Mission V2 Sprint 8 §19 — PromoteChecklistItemToKnowledgeUseCase délègue à Tenders
  // (ChecklistItemRepository, TenderRepository via `assertTenderMutationAllowed` — correctif audit
  // Codex P1-01) pour charger l'item/le Tender source, anti-IDOR scopé (organizationId, tenderId,
  // itemId) : laisse leurs erreurs remonter telles quelles, même motif que Documents/Extraction
  // ci-dessus.
  CHECKLIST_ITEM_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,

  // Mission Sprint 5.1 — CreateKnowledgeEntryUseCase/AddKnowledgeDocumentUseCase délèguent
  // désormais aussi à Client Portfolio (clientAccountId optionnel).
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
};

@Catch(DomainError)
export class KnowledgeErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      error: { code: exception.code, message: exception.message, requestId: request.id },
    });
  }
}
