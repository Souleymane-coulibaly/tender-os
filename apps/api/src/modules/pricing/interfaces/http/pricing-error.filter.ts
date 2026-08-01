import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  // Erreurs cross-module réelles : Pricing délègue à Tenders (GetTenderUseCase) et à Client
  // Portfolio (AssertClientAccessUseCase/GetClientAccountUseCase) et laisse leurs erreurs remonter
  // telles quelles — même motif que GenerationErrorFilter pour ces mêmes codes.
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,

  INVALID_MONEY_AMOUNT: HttpStatus.UNPROCESSABLE_ENTITY,
  NEGATIVE_AMOUNT_NOT_ALLOWED: HttpStatus.UNPROCESSABLE_ENTITY,
  AMOUNT_TOO_LARGE: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_CURRENCY: HttpStatus.UNPROCESSABLE_ENTITY,
  CURRENCY_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_PRICING_ASSUMPTION: HttpStatus.UNPROCESSABLE_ENTITY,
  PRICING_ESTIMATE_NOT_FOUND: HttpStatus.NOT_FOUND,
  PRICING_ESTIMATE_ARCHIVED: HttpStatus.CONFLICT,
  PRICING_ESTIMATE_VERSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  PRICING_ESTIMATE_CONCURRENT_RECALCULATION: HttpStatus.CONFLICT,
  INVALID_PRICING_SCOPE: HttpStatus.UNPROCESSABLE_ENTITY,
  PRICING_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
};

@Catch(DomainError)
export class PricingErrorFilter implements ExceptionFilter {
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
