import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  // Propres au module workspace.
  TENDER_PARTICIPANT_ACCESS_DENIED: HttpStatus.NOT_FOUND,
  TENDER_PARTICIPANT_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PARTICIPANT_ALREADY_ACTIVE: HttpStatus.CONFLICT,
  INVALID_TENDER_PARTICIPANT_CANDIDATE: HttpStatus.UNPROCESSABLE_ENTITY,
  TENDER_PARTICIPANT_BYPASS_JUSTIFICATION_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  TASK_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_TASK_ASSIGNEE: HttpStatus.UNPROCESSABLE_ENTITY,
  COMMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  COMMENT_DELETED: HttpStatus.CONFLICT,
  COMMENT_EDIT_FORBIDDEN: HttpStatus.FORBIDDEN,
  INVALID_COMMENT_ENTITY: HttpStatus.NOT_FOUND,
  INVALID_MENTION_TARGET: HttpStatus.UNPROCESSABLE_ENTITY,
  APPROVAL_REQUEST_NOT_FOUND: HttpStatus.NOT_FOUND,
  APPROVAL_AUTO_VALIDATION_FORBIDDEN: HttpStatus.UNPROCESSABLE_ENTITY,
  APPROVAL_REVIEWER_NOT_AUTHORIZED: HttpStatus.FORBIDDEN,
  APPROVAL_REQUEST_ALREADY_REVIEWED: HttpStatus.CONFLICT,
  APPROVAL_REJECTION_REASON_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  APPROVAL_TARGET_NOT_IMMUTABLE: HttpStatus.UNPROCESSABLE_ENTITY,

  // Erreurs cross-module réelles (mêmes conventions que checklist-intelligence/tenders) — jamais
  // révéler l'existence d'une ressource inaccessible, même 404 anti-énumération.
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  TENDER_LOT_MISMATCH: HttpStatus.NOT_FOUND,
  CHECKLIST_ITEM_NOT_FOUND: HttpStatus.NOT_FOUND,
  DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,

  // V2 Sprint 22 (billing, étape 22A, correctif audit Codex P1-01).
  ENTITLEMENT_FEATURE_NOT_AVAILABLE: HttpStatus.FORBIDDEN,
};

@Catch(DomainError)
export class WorkspaceErrorFilter implements ExceptionFilter {
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
