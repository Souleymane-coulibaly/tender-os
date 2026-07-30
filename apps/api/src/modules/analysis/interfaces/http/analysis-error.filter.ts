import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  // Erreurs cross-module réelles : Analysis délègue à Tenders (GetTenderUseCase) et à Extraction
  // (GetDocumentAnalysisInputUseCase, contrat public P1-04) et laisse leurs erreurs remonter
  // telles quelles — même motif que ExtractionErrorFilter pour TENDER_NOT_FOUND.
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  EXTRACTION_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  DOCUMENT_EXTRACTION_NOT_FOUND: HttpStatus.NOT_FOUND,
  EXTRACTION_NOT_READY_FOR_ANALYSIS: HttpStatus.CONFLICT,

  INVALID_ANALYSIS_STATUS: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_ANALYSIS_SCOPE: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_ANALYSIS_STATUS_TRANSITION: HttpStatus.CONFLICT,
  ANALYSIS_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  ANALYSIS_NOT_FOUND: HttpStatus.NOT_FOUND,
  ANALYSIS_NOT_READY: HttpStatus.CONFLICT,
  ANALYSIS_ALREADY_RUNNING: HttpStatus.CONFLICT,
  ANALYSIS_ATTEMPT_STALE: HttpStatus.CONFLICT,
  ANALYSIS_INPUT_UNAVAILABLE: HttpStatus.UNPROCESSABLE_ENTITY,
  ANALYSIS_NOT_RETRYABLE: HttpStatus.CONFLICT,
  ANALYSIS_NOT_CANCELLABLE: HttpStatus.CONFLICT,
  ANALYSIS_RETRY_LIMIT_EXCEEDED: HttpStatus.CONFLICT,
  TENDER_BUSINESS_ANALYSIS_NOT_FOUND: HttpStatus.NOT_FOUND,
  NO_DOCUMENT_ANALYSES_AVAILABLE: HttpStatus.CONFLICT,

  AI_PROVIDER_NOT_CONFIGURED: HttpStatus.SERVICE_UNAVAILABLE,
  AI_PROVIDER_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  AI_AUTHENTICATION_FAILED: HttpStatus.SERVICE_UNAVAILABLE,
  AI_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  AI_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  AI_INVALID_RESPONSE: HttpStatus.UNPROCESSABLE_ENTITY,
  AI_SCHEMA_VALIDATION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
  AI_PROVENANCE_VALIDATION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
};

@Catch(DomainError)
export class AnalysisErrorFilter implements ExceptionFilter {
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
