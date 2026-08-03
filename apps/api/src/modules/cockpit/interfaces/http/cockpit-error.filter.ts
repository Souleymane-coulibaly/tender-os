import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

/**
 * Mission Sprint 8A.2 — `GetTenderCockpitUseCase` compose des use cases publics de 9 modules ;
 * leurs erreurs (permission manquante, Tender/client introuvable) doivent remonter avec le MÊME
 * statut HTTP que sur leur propre écran, jamais un 500 générique. Les absences "normales"
 * (aucun DCE, aucune synthèse d'analyse) sont interceptées DANS le use case (mission "jamais un
 * blocage inventé") et n'atteignent donc jamais ce filtre.
 */
const STATUS_BY_CODE: Record<string, number> = {
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  DCE_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  DOCUMENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  ANALYSIS_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
};

@Catch(DomainError)
export class CockpitErrorFilter implements ExceptionFilter {
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
