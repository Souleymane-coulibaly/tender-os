import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

/** Même motif que `PlatformAdministrationErrorFilter` — inclut les codes Platform Administration
 *  (PLATFORM_ACCESS_DENIED/PLATFORM_CAPABILITY_MISSING) car `assertHasCapability` est appelé
 *  DEPUIS les use cases `billing` (mission §32 "Platform Admin only"), jamais réimplémenté. */
const STATUS_BY_CODE: Record<string, number> = {
  PLATFORM_ACCESS_DENIED: HttpStatus.FORBIDDEN,
  PLATFORM_CAPABILITY_MISSING: HttpStatus.FORBIDDEN,

  ENTITLEMENT_OVERRIDE_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_ENTITLEMENT_OVERRIDE_TARGET: HttpStatus.UNPROCESSABLE_ENTITY,
  ENTITLEMENT_OVERRIDE_REASON_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  ENTITLEMENT_OVERRIDE_ALREADY_REVOKED: HttpStatus.CONFLICT,

  SUBSCRIPTION_NOT_FOUND: HttpStatus.NOT_FOUND,
  PASS_PURCHASE_NOT_FOUND: HttpStatus.NOT_FOUND,
  PASS_PURCHASE_ALREADY_CONSUMED: HttpStatus.CONFLICT,
  PASS_PURCHASE_NOT_AVAILABLE: HttpStatus.CONFLICT,
};

@Catch(DomainError)
export class BillingErrorFilter implements ExceptionFilter {
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
