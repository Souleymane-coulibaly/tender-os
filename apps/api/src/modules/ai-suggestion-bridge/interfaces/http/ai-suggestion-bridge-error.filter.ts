import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  AI_SUGGESTION_NOT_FOUND: HttpStatus.NOT_FOUND,
  AI_SUGGESTION_ALREADY_PROCESSED: HttpStatus.CONFLICT,
  AI_SUGGESTION_PERMISSION_DENIED: HttpStatus.FORBIDDEN,
  AI_SUGGESTION_INVALID_PROPOSED_VALUE: HttpStatus.UNPROCESSABLE_ENTITY,
  AI_SUGGESTION_SCHEMA_NOT_REGISTERED: HttpStatus.UNPROCESSABLE_ENTITY,
  AI_SUGGESTION_BRIDGE_UNSUPPORTED_ENTITY_TYPE: HttpStatus.UNPROCESSABLE_ENTITY,
  // §12 — une décision est requise (409, même famille que TENDER_CONCURRENT_MODIFICATION :
  // l'état actuel du serveur diverge de ce que le client suppose, une nouvelle requête explicite
  // est nécessaire).
  AI_SUGGESTION_TARGET_CONFLICT: HttpStatus.CONFLICT,
  AI_SUGGESTION_MERGE_NOT_ALLOWED: HttpStatus.UNPROCESSABLE_ENTITY,
  // IDOR horizontal (lot d'un autre Tender) — jamais révéler l'existence, même convention que
  // TENDER_LOT_MISMATCH côté Tenders.
  AI_SUGGESTION_LOT_MISMATCH: HttpStatus.NOT_FOUND,
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_LOT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  // Correctif audit Codex P2 — un ChecklistItemAdapter (CHECKLIST_ITEM) peut porter
  // subjectSubcontractorProfileId ; mêmes codes/conventions que côté TendersErrorFilter.
  CHECKLIST_SUBCONTRACTOR_SUBJECT_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_CHECKLIST_SUBJECT: HttpStatus.UNPROCESSABLE_ENTITY,
};

@Catch(DomainError)
export class AiSuggestionBridgeErrorFilter implements ExceptionFilter {
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
