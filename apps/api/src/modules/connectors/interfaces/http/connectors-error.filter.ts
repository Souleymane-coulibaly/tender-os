import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

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
  REMOTE_PROVIDER_ERROR: HttpStatus.BAD_GATEWAY,
  REMOTE_PROVIDER_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  TENDER_DEADLINE_NOT_SET: HttpStatus.UNPROCESSABLE_ENTITY,

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
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      error: { code: exception.code, message: exception.message, requestId: request.id },
    });
  }
}
