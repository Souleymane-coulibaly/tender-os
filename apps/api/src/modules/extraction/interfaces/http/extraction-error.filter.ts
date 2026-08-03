import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  // Erreur cross-module réelle : Extraction délègue à Tenders (GetTenderUseCase) et laisse son
  // erreur remonter telle quelle — même motif que DceErrorFilter pour TENDER_NOT_FOUND.
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  // Mission Sprint 8A.2 (audit isolation inter-client) — GetTenderUseCase délègue aussi à Client
  // Portfolio (AssertClientAccessUseCase) dès que `actorId` lui est fourni ; ces deux entrées
  // manquaient (même gap déjà corrigé pour DceErrorFilter, bug #3) et retombaient sur 500 dès que
  // ce chemin était réellement exercé. CLIENT_ACCOUNT_NOT_FOUND reste un 404 (jamais 403) — même
  // logique anti-énumération que partout ailleurs.
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,

  DOCUMENT_EXTRACTION_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_DOCUMENT_EXTRACTION_STATUS: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_EXTRACTION_STATUS_TRANSITION: HttpStatus.CONFLICT,
  EXTRACTION_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  EXTRACTION_ALREADY_RUNNING: HttpStatus.CONFLICT,
  UNSUPPORTED_DOCUMENT_FORMAT: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  ENCRYPTED_PDF: HttpStatus.UNPROCESSABLE_ENTITY,
  CORRUPTED_DOCUMENT: HttpStatus.UNPROCESSABLE_ENTITY,
  EXTRACTION_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  OCR_PROVIDER_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  EXTRACTION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
  EXTRACTION_RESULT_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  EXTRACTION_RETRY_LIMIT_EXCEEDED: HttpStatus.CONFLICT,
  EXTRACTION_NOT_RETRYABLE: HttpStatus.CONFLICT,

  // Limites de ressources (correction P1-03).
  FILE_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  PAGE_LIMIT_EXCEEDED: HttpStatus.UNPROCESSABLE_ENTITY,
  CHARACTER_LIMIT_EXCEEDED: HttpStatus.UNPROCESSABLE_ENTITY,
  SPREADSHEET_LIMIT_EXCEEDED: HttpStatus.UNPROCESSABLE_ENTITY,
  IMAGE_DIMENSION_LIMIT_EXCEEDED: HttpStatus.UNPROCESSABLE_ENTITY,

  // Corpus d'analyse (correction P1-04).
  EXTRACTION_NOT_READY_FOR_ANALYSIS: HttpStatus.CONFLICT,
};

@Catch(DomainError)
export class ExtractionErrorFilter implements ExceptionFilter {
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
