import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  AI_SUGGESTION_NOT_FOUND: HttpStatus.NOT_FOUND,
  AI_SUGGESTION_ALREADY_PROCESSED: HttpStatus.CONFLICT,
  AI_SUGGESTION_INVALID_PROPOSED_VALUE: HttpStatus.UNPROCESSABLE_ENTITY,
  AI_SUGGESTION_PERMISSION_DENIED: HttpStatus.FORBIDDEN,
  // Correctif audit Codex P1-003 — absence de schéma enregistré : erreur de configuration/
  // gouvernance, jamais une erreur serveur (500).
  AI_SUGGESTION_SCHEMA_NOT_REGISTERED: HttpStatus.UNPROCESSABLE_ENTITY,
};

@Catch(DomainError)
export class AiSuggestionErrorFilter implements ExceptionFilter {
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
