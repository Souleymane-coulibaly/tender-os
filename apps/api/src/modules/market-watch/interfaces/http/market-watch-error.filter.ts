import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  SAVED_SEARCH_NOT_FOUND: HttpStatus.NOT_FOUND,
  EXTERNAL_TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  SAVED_SEARCH_MATCH_NOT_FOUND: HttpStatus.NOT_FOUND,
  MARKET_WATCH_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  INVALID_EMAIL_FREQUENCY: HttpStatus.UNPROCESSABLE_ENTITY,
  EXTERNAL_TENDER_ALREADY_PROMOTED: HttpStatus.CONFLICT,

  // Erreurs cross-module réelles (mission §101/§102 style anti-énumération, même motif Sprint 16).
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
};

@Catch(DomainError)
export class MarketWatchErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    const metadata = "existingOpportunityId" in exception && typeof (exception as { existingOpportunityId?: unknown }).existingOpportunityId === "string" ? { existingOpportunityId: (exception as { existingOpportunityId: string }).existingOpportunityId } : undefined;

    response.status(status).json({
      error: { code: exception.code, message: exception.message, requestId: request.id, ...(metadata ? { details: metadata } : {}) },
    });
  }
}
