import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_TENDER_STATUS_TRANSITION: HttpStatus.CONFLICT,
  TENDER_ARCHIVED: HttpStatus.CONFLICT,
  INVALID_TENDER_STATUS: HttpStatus.UNPROCESSABLE_ENTITY,
  TENDER_CONCURRENT_MODIFICATION: HttpStatus.CONFLICT,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  TENDER_LOT_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_TENDER_LOT_NUMBER: HttpStatus.CONFLICT,
  TENDER_LOT_DELETED: HttpStatus.CONFLICT,
  TENDER_LOT_NOT_DELETED: HttpStatus.CONFLICT,
  INVALID_LOT_REORDER_PAYLOAD: HttpStatus.UNPROCESSABLE_ENTITY,
  CHECKLIST_ITEM_NOT_FOUND: HttpStatus.NOT_FOUND,
  AWARD_CRITERION_NOT_FOUND: HttpStatus.NOT_FOUND,
  REQUESTED_DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  MILESTONE_NOT_FOUND: HttpStatus.NOT_FOUND,
  RISK_NOT_FOUND: HttpStatus.NOT_FOUND,
  ALERT_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_MARKET_TYPE: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_TENDER_COUNTRY: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_TENDER_LANGUAGE: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_TENDER_SOURCE: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_LOT_ESTIMATED_AMOUNT: HttpStatus.UNPROCESSABLE_ENTITY,
  TENDER_CANDIDATE_CHANGE_NOT_ALLOWED: HttpStatus.CONFLICT,
  BUYER_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_TENDER_ESTIMATED_AMOUNT: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_TENDER_AMOUNT_RANGE: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_LOT_AMOUNT_RANGE: HttpStatus.UNPROCESSABLE_ENTITY,
  // IDOR horizontal (audit Codex P1) : jamais révéler qu'un lot existe ailleurs — 404, même
  // convention que TENDER_LOT_NOT_FOUND ci-dessus.
  TENDER_LOT_MISMATCH: HttpStatus.NOT_FOUND,

  // Correctif audit Codex P2 (sujet sous-traitant) — même convention anti-énumération que
  // TENDER_LOT_MISMATCH : inexistant, autre organisation, ou archivé, jamais distingué côté HTTP.
  CHECKLIST_SUBCONTRACTOR_SUBJECT_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_CHECKLIST_SUBJECT: HttpStatus.UNPROCESSABLE_ENTITY,

  // Erreurs cross-module réelles (mission Sprint 5.1) — Tenders délègue à Client Portfolio
  // (CreateTenderUseCase, GetTenderUseCase) et laisse ses erreurs remonter telles quelles, même
  // motif que le réexport de GetTenderUseCase par Documents/Analysis/DCE/Extraction.
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
};

@Catch(DomainError)
export class TendersErrorFilter implements ExceptionFilter {
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
