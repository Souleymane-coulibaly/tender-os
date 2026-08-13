import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  // Propres au module document-generation.
  DOCUMENT_TEMPLATE_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_DOCUMENT_TEMPLATE_NAME: HttpStatus.CONFLICT,
  DOCUMENT_TEMPLATE_VERSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  NO_ACTIVE_DOCUMENT_TEMPLATE_VERSION: HttpStatus.CONFLICT,
  INVALID_DOCUMENT_TEMPLATE_VERSION_STATUS_TRANSITION: HttpStatus.CONFLICT,
  DOCUMENT_TEMPLATE_VERSION_ACTIVATION_CONFLICT: HttpStatus.CONFLICT,
  DOCUMENT_GENERATION_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  INVALID_TEMPLATE_FILE: HttpStatus.UNPROCESSABLE_ENTITY,
  GENERATED_DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  GENERATED_DOCUMENT_REVISION_NOT_FOUND: HttpStatus.NOT_FOUND,
  REQUIRED_FIELDS_MISSING: HttpStatus.UNPROCESSABLE_ENTITY,
  ARTIFACT_NOT_READY: HttpStatus.CONFLICT,
  DOCX_MERGE_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
  CONCURRENT_DOCUMENT_GENERATION: HttpStatus.CONFLICT,

  // Erreurs cross-module réelles (mêmes conventions que chat/workspace/knowledge-base) — jamais
  // révéler l'existence d'une ressource inaccessible, même 404 anti-énumération.
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
};

@Catch(DomainError)
export class DocumentGenerationErrorFilter implements ExceptionFilter {
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
