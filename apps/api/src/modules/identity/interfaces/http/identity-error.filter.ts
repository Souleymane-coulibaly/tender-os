import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

/**
 * Traduit les erreurs du Domain Identity/Authentication vers l'enveloppe HTTP canonique
 * (skills/platform-foundation/API_PATTERNS.md §13-14). Scopé à ce module via @UseFilters
 * plutôt qu'enregistré globalement : chaque module reste responsable de ses propres codes.
 */
const STATUS_BY_CODE: Record<string, number> = {
  INVALID_EMAIL_ADDRESS: HttpStatus.UNPROCESSABLE_ENTITY,
  EMAIL_ALREADY_REGISTERED: HttpStatus.CONFLICT,
  USER_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  USER_NOT_ACTIVE: HttpStatus.FORBIDDEN,
  SESSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  TERMS_NOT_ACCEPTED: HttpStatus.UNPROCESSABLE_ENTITY,
  PASSWORD_RESET_TOKEN_INVALID: HttpStatus.BAD_REQUEST,
  INVALID_PAGE_GUIDE_KEY: HttpStatus.BAD_REQUEST,
};

@Catch(DomainError)
export class IdentityErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      error: {
        code: exception.code,
        message: exception.message,
        requestId: request.id,
      },
    });
  }
}
