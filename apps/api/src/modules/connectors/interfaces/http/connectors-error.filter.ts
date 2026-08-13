import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ProviderErrorCode } from "../../domain/enums";
import { RemoteProviderError } from "../../domain/errors";

/** Mission §13 — statut HTTP dérivé de `providerErrorCode` (jamais le statut brut du provider
 *  propagé tel quel). AUTH_ERROR -> 401 (déclenche naturellement un flux "reconnecter" côté
 *  frontend, cohérent avec REAUTH_REQUIRED) plutôt que 502, pour rester actionnable côté client. */
const STATUS_BY_PROVIDER_ERROR_CODE: Record<ProviderErrorCode, number> = {
  AUTH_ERROR: HttpStatus.UNAUTHORIZED,
  PERMISSION_DENIED: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  PROVIDER_UNAVAILABLE: HttpStatus.BAD_GATEWAY,
  INVALID_REQUEST: HttpStatus.UNPROCESSABLE_ENTITY,
  UNKNOWN: HttpStatus.BAD_GATEWAY,
};

/** Mission §70/§101 — format d'erreur cohérent `{error:{code,message,requestId}}`. `OAUTH_STATE_
 *  INVALID` volontairement 400 (jamais 401/403/404 distinctifs, mission §54/§55/§102
 *  anti-énumération : un state forgé/expiré/rejoué/appartenant à une autre organisation ne doit
 *  jamais être distinguable côté réponse HTTP). */
const STATUS_BY_CODE: Record<string, number> = {
  EXTERNAL_CONNECTION_NOT_FOUND: HttpStatus.NOT_FOUND,
  EXTERNAL_CONNECTION_REVOKED: HttpStatus.CONFLICT,
  EXTERNAL_CONNECTION_NOT_USABLE: HttpStatus.CONFLICT,
  EXTERNAL_CONNECTION_ALREADY_EXISTS: HttpStatus.CONFLICT,
  EXTERNAL_CONNECTION_CLIENT_NOT_ALLOWED: HttpStatus.NOT_FOUND,
  CONNECTOR_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  OAUTH_STATE_INVALID: HttpStatus.BAD_REQUEST,
  SYNC_CONFIGURATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  EXPORT_TARGET_NOT_FOUND: HttpStatus.NOT_FOUND,
  UNSUPPORTED_REMOTE_FILE_TYPE: HttpStatus.UNPROCESSABLE_ENTITY,
  TENDER_DEADLINE_NOT_SET: HttpStatus.UNPROCESSABLE_ENTITY,
  EXTERNAL_FILE_OPERATION_IN_PROGRESS: HttpStatus.CONFLICT,
  EXTERNAL_FILE_EXPORT_NEEDS_RECONCILIATION: HttpStatus.CONFLICT,

  // Erreurs cross-module réelles (mission §101/§102 anti-énumération) — mêmes codes que
  // `tenders`/`documents`/`client-portfolio`, jamais réinventés, jamais un statut différent de
  // celui que ces modules utilisent pour eux-mêmes.
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  DOCUMENT_VERSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  DOCUMENT_ARCHIVED: HttpStatus.CONFLICT,
  DOCUMENT_DELETED: HttpStatus.CONFLICT,
  DOCUMENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  INVALID_DOCUMENT_ORIGIN: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_DOCUMENT_DOMAIN: HttpStatus.UNPROCESSABLE_ENTITY,
  CONCURRENT_VERSION_CREATION: HttpStatus.CONFLICT,
  DUPLICATE_DOCUMENT_TENDER_ASSOCIATION: HttpStatus.CONFLICT,
  EMPTY_FILE: HttpStatus.UNPROCESSABLE_ENTITY,
  FILE_TOO_LARGE: HttpStatus.UNPROCESSABLE_ENTITY,
  UNSUPPORTED_FILE_TYPE: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_FILENAME: HttpStatus.UNPROCESSABLE_ENTITY,
};

@Catch(DomainError)
export class ConnectorsErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    if (exception instanceof RemoteProviderError) {
      const status = STATUS_BY_PROVIDER_ERROR_CODE[exception.providerErrorCode];
      if (exception.retryAfterSeconds !== undefined) {
        response.setHeader("Retry-After", String(exception.retryAfterSeconds));
      }
      // Mission §84/§101 — jamais `technicalDetail` (statut HTTP brut + extrait de réponse
      // provider) dans la réponse JSON, uniquement le message générique déjà sanitisé.
      response.status(status).json({
        error: { code: exception.providerErrorCode, message: exception.message, requestId: request.id },
      });
      return;
    }

    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status).json({
      error: { code: exception.code, message: exception.message, requestId: request.id },
    });
  }
}
