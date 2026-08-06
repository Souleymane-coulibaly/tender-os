import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,

  SUBCONTRACTOR_PROFILE_NOT_FOUND: HttpStatus.NOT_FOUND,
  SUBCONTRACTOR_REFERENCE_NOT_FOUND: HttpStatus.NOT_FOUND,
  SUBCONTRACTOR_CERTIFICATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  SUBCONTRACTOR_INSURANCE_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_SUBCONTRACTOR_PROFILE_STATUS_TRANSITION: HttpStatus.CONFLICT,
  INVALID_SUBCONTRACTOR_IDENTIFIER_FORMAT: HttpStatus.UNPROCESSABLE_ENTITY,
  SUBCONTRACTOR_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  DOCUMENT_NOT_USABLE_FOR_SUBCONTRACTOR_PROFILE: HttpStatus.UNPROCESSABLE_ENTITY,
  DUPLICATE_SUBCONTRACTOR_PROFILE_DOCUMENT: HttpStatus.CONFLICT,
};

@Catch(DomainError)
export class SubcontractorErrorFilter implements ExceptionFilter {
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
