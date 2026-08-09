import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  // Propres au module chat.
  CONVERSATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  CONVERSATION_ARCHIVED: HttpStatus.CONFLICT,
  CONVERSATION_GENERATION_IN_PROGRESS: HttpStatus.CONFLICT,
  // Correctif audit Codex P1 (garde-fou volume IA) — plafond de messages facturables par Tender/jour
  // atteint, jamais un appel IA au-delà.
  CHAT_RATE_LIMIT_REACHED: HttpStatus.TOO_MANY_REQUESTS,
  CHAT_SCHEMA_VALIDATION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
  CHAT_CITATION_VALIDATION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,

  // Erreurs cross-module réelles (mêmes conventions que workspace/knowledge-base) — jamais révéler
  // l'existence d'une ressource inaccessible, même 404 anti-énumération.
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  TENDER_LOT_MISMATCH: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
};

@Catch(DomainError)
export class ChatErrorFilter implements ExceptionFilter {
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
