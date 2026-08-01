import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  // Erreurs cross-module réelles : Generation délègue à Tenders (GetTenderUseCase) et à
  // Client Portfolio (AssertClientAccessUseCase) et laisse leurs erreurs remonter telles quelles
  // — même motif qu'AnalysisErrorFilter pour ces mêmes codes.
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,

  INVALID_GENERATION_TASK_TYPE: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_GENERATION_OUTPUT_MODE: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_GENERATION_STATUS: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_GENERATION_STATUS_TRANSITION: HttpStatus.CONFLICT,
  INVALID_PROMPT_VERSION_STATUS_TRANSITION: HttpStatus.CONFLICT,
  GENERATION_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  GENERATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  GENERATION_ALREADY_RUNNING: HttpStatus.CONFLICT,
  GENERATION_NOT_RETRYABLE: HttpStatus.CONFLICT,
  GENERATION_NOT_CANCELLABLE: HttpStatus.CONFLICT,
  GENERATION_NOT_EDITABLE: HttpStatus.CONFLICT,
  GENERATION_NOT_VALIDATABLE: HttpStatus.CONFLICT,
  GENERATION_NOT_REJECTABLE: HttpStatus.CONFLICT,
  GENERATION_ALREADY_VALIDATED: HttpStatus.CONFLICT,
  GENERATION_ALREADY_REJECTED: HttpStatus.CONFLICT,
  GENERATION_NOT_OWNED_BY_ACTOR: HttpStatus.FORBIDDEN,
  PROMPT_TEMPLATE_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_PROMPT_TEMPLATE: HttpStatus.CONFLICT,
  PROMPT_TEMPLATE_ARCHIVED: HttpStatus.CONFLICT,
  PROMPT_VERSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  NO_ACTIVE_PROMPT_VERSION: HttpStatus.CONFLICT,
  NO_ACTIVE_ROUTING_POLICY: HttpStatus.CONFLICT,
  ROUTING_DECISION_PERSISTENCE_FAILED: HttpStatus.INTERNAL_SERVER_ERROR,
  PROMPT_VERSION_ACTIVATION_CONFLICT: HttpStatus.CONFLICT,
  PROMPT_VARIABLE_MISSING: HttpStatus.UNPROCESSABLE_ENTITY,
  GENERATION_SCHEMA_VALIDATION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
  GENERATION_CITATION_VALIDATION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
};

@Catch(DomainError)
export class GenerationErrorFilter implements ExceptionFilter {
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
