import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  CHECKLIST_ITEM_NOT_FOUND: HttpStatus.NOT_FOUND,
  // Jamais un attachement cross-tenant, même convention 404 anti-énumération que le reste du dépôt.
  DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  // Correctif audit Codex P1 — documentVersionId inexistant, appartenant à un autre document, ou à
  // une autre organisation : même convention 404, jamais une confirmation d'existence partielle.
  DOCUMENT_VERSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  SUBCONTRACTOR_PROFILE_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,

  // V2 Sprint 6 §22 — ReconcileChecklistWithNewAnalysisUseCase crée des AiSuggestion via
  // CreateAiSuggestionUseCase (module ai-suggestion) et laisse ses erreurs remonter telles quelles,
  // même motif que les erreurs cross-module Client Portfolio ci-dessus.
  AI_SUGGESTION_NOT_FOUND: HttpStatus.NOT_FOUND,
  AI_SUGGESTION_ALREADY_PROCESSED: HttpStatus.CONFLICT,
  AI_SUGGESTION_INVALID_PROPOSED_VALUE: HttpStatus.UNPROCESSABLE_ENTITY,
  AI_SUGGESTION_SCHEMA_NOT_REGISTERED: HttpStatus.UNPROCESSABLE_ENTITY,
  AI_SUGGESTION_PERMISSION_DENIED: HttpStatus.FORBIDDEN,
};

@Catch(DomainError)
export class ChecklistIntelligenceErrorFilter implements ExceptionFilter {
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
