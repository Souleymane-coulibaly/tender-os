import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  // Mission §"jamais 403, toujours 404" pour un acteur sans aucune affectation (même convention
  // que `OrganizationMembershipGuard`) — ne jamais révéler l'existence d'un client à un acteur qui
  // n'y a structurellement aucun accès.
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_CLIENT_ACCOUNT_NAME: HttpStatus.CONFLICT,
  INVALID_CLIENT_ACCOUNT_STATUS: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_CLIENT_ACCOUNT_STATUS_TRANSITION: HttpStatus.CONFLICT,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_ACCOUNT_NOT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_ACCOUNT_HAS_DEPENDENCIES: HttpStatus.CONFLICT,
  INVALID_CLIENT_ROLE: HttpStatus.UNPROCESSABLE_ENTITY,
  CLIENT_ASSIGNMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_CLIENT_ASSIGNMENT: HttpStatus.CONFLICT,
  CROSS_ORGANIZATION_USER: HttpStatus.UNPROCESSABLE_ENTITY,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  INVALID_CLIENT_KNOWLEDGE_SCOPE: HttpStatus.UNPROCESSABLE_ENTITY,
};

@Catch(DomainError)
export class ClientPortfolioErrorFilter implements ExceptionFilter {
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
