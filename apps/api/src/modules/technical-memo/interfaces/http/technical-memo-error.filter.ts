import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  TECHNICAL_MEMO_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_TECHNICAL_MEMO: HttpStatus.CONFLICT,
  TECHNICAL_MEMO_SECTION_NOT_FOUND: HttpStatus.NOT_FOUND,
  TECHNICAL_MEMO_SECTION_REQUIREMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  NO_HEADINGS_DETECTED: HttpStatus.UNPROCESSABLE_ENTITY,
  TECHNICAL_MEMO_SECTION_ALREADY_VALIDATED: HttpStatus.CONFLICT,
  TECHNICAL_MEMO_TEMPLATE_NOT_READY: HttpStatus.CONFLICT,
  TECHNICAL_MEMO_CITATION_VALIDATION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,

  // Erreurs cross-module réelles — jamais révéler l'existence d'une ressource inaccessible, même
  // 404 anti-énumération (même convention que Chat/Workspace/Knowledge Base/document-generation).
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  TENDER_LOT_MISMATCH: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
};

@Catch(DomainError)
export class TechnicalMemoErrorFilter implements ExceptionFilter {
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
