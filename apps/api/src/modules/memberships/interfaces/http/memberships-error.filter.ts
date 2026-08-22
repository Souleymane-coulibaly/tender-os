import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

/**
 * Traduit les erreurs du Domain Memberships (et celles, réutilisées telles quelles, des
 * modules Identity/Organizations qu'il appelle) vers l'enveloppe HTTP canonique
 * (skills/platform-foundation/API_PATTERNS.md §13-14). Scopé à ce module via @UseFilters.
 */
const STATUS_BY_CODE: Record<string, number> = {
  INVALID_ORGANIZATION_ROLE: HttpStatus.UNPROCESSABLE_ENTITY,
  MEMBERSHIP_ALREADY_EXISTS: HttpStatus.CONFLICT,
  MEMBERSHIP_NOT_FOUND: HttpStatus.NOT_FOUND,
  MEMBERSHIP_NOT_ACTIVE: HttpStatus.CONFLICT,
  LAST_ORGANIZATION_ADMIN_REQUIRED: HttpStatus.CONFLICT,
  LAST_ORGANIZATION_OWNER_REQUIRED: HttpStatus.CONFLICT,
  OWNERSHIP_REQUIRES_TRANSFER: HttpStatus.CONFLICT,
  NOT_ORGANIZATION_OWNER: HttpStatus.FORBIDDEN,
  CANNOT_TRANSFER_OWNERSHIP_TO_SELF: HttpStatus.UNPROCESSABLE_ENTITY,
  PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  USER_NOT_FOUND: HttpStatus.NOT_FOUND,
  ORGANIZATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  ORGANIZATION_SLUG_ALREADY_TAKEN: HttpStatus.CONFLICT,
  // Checkpoint TENDEROS-2.1-P2.3-E1 — même statut que `INSUFFICIENT_AO_CREDITS` (billing) : une
  // limite de plan/quota commerciale, jamais une simple erreur de validation.
  SEAT_LIMIT_EXCEEDED: HttpStatus.PAYMENT_REQUIRED,
};

@Catch(DomainError)
export class MembershipsErrorFilter implements ExceptionFilter {
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
