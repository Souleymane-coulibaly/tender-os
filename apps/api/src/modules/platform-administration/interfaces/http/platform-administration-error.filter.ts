import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

/**
 * Traduit les erreurs du Domain Platform Administration (et celles, réutilisées telles
 * quelles, du Domain Organizations qu'il appelle) vers l'enveloppe HTTP canonique
 * (skills/platform-foundation/API_PATTERNS.md §13-14). Scopé à ce module via @UseFilters.
 */
const STATUS_BY_CODE: Record<string, number> = {
  PLATFORM_ACCESS_DENIED: HttpStatus.FORBIDDEN,
  PLATFORM_CAPABILITY_MISSING: HttpStatus.FORBIDDEN,
  PLATFORM_ADMINISTRATOR_ALREADY_EXISTS: HttpStatus.CONFLICT,
  ORGANIZATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_ORGANIZATION_STATUS_TRANSITION: HttpStatus.CONFLICT,
};

@Catch(DomainError)
export class PlatformAdministrationErrorFilter implements ExceptionFilter {
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
