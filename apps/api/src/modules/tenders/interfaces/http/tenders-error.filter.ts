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
  CHECKLIST_ITEM_NOT_FOUND: HttpStatus.NOT_FOUND,
  AWARD_CRITERION_NOT_FOUND: HttpStatus.NOT_FOUND,
  REQUESTED_DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  MILESTONE_NOT_FOUND: HttpStatus.NOT_FOUND,
  RISK_NOT_FOUND: HttpStatus.NOT_FOUND,
  ALERT_NOT_FOUND: HttpStatus.NOT_FOUND,
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
