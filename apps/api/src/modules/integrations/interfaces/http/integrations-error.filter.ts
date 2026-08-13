import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

/** Mission §70 — format d'erreur cohérent `{error:{code,message,requestId}}`, jamais une stack
 *  trace exposée. */
const STATUS_BY_CODE: Record<string, number> = {
  API_KEY_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_API_KEY_SCOPE: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_API_KEY_CLIENT_SCOPE: HttpStatus.UNPROCESSABLE_ENTITY,
  API_KEY_AUTHENTICATION_FAILED: HttpStatus.UNAUTHORIZED,
  API_KEY_SCOPE_MISSING: HttpStatus.FORBIDDEN,
  WEBHOOK_SUBSCRIPTION_NOT_FOUND: HttpStatus.NOT_FOUND,
  WEBHOOK_DELIVERY_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_WEBHOOK_EVENT_TYPE: HttpStatus.UNPROCESSABLE_ENTITY,
  UNSAFE_WEBHOOK_ENDPOINT_URL: HttpStatus.UNPROCESSABLE_ENTITY,
  WEBHOOK_DELIVERY_NOT_RETRYABLE: HttpStatus.CONFLICT,
  INTEGRATION_PERMISSION_MISSING: HttpStatus.FORBIDDEN,

  // Erreurs cross-module réelles (mission §101/§102 anti-énumération).
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  RESPONSE_PACKAGE_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,

  // V2 Sprint 22 (billing, étape 22A, correctif audit Codex P1-01).
  ENTITLEMENT_FEATURE_NOT_AVAILABLE: HttpStatus.FORBIDDEN,
};

@Catch(DomainError)
export class IntegrationsErrorFilter implements ExceptionFilter {
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
