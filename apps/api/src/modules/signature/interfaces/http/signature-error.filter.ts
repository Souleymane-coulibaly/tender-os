import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  EXPORT_JOB_NOT_FOUND: HttpStatus.NOT_FOUND,
  EXPORT_ARTIFACT_NOT_FOUND: HttpStatus.NOT_FOUND,

  SIGNATURE_REQUIREMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  SIGNATORY_NOT_FOUND: HttpStatus.NOT_FOUND,
  SIGNATORY_NOT_VERIFIED: HttpStatus.UNPROCESSABLE_ENTITY,
  SIGNATURE_TRANSACTION_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_SIGNATURE_TRANSACTION_TRANSITION: HttpStatus.CONFLICT,
  EXPORT_NOT_ELIGIBLE_FOR_SIGNATURE: HttpStatus.UNPROCESSABLE_ENTITY,
  UNKNOWN_PROVIDER_TRANSACTION: HttpStatus.NOT_FOUND,
  WEBHOOK_SIGNATURE_INVALID: HttpStatus.UNAUTHORIZED,
  DUPLICATE_PROVIDER_EVENT: HttpStatus.OK,
  SIGNATURE_PROVIDER_MISCONFIGURED: HttpStatus.SERVICE_UNAVAILABLE,
  UNIVERSIGN_PRODUCTION_CALL_FORBIDDEN: HttpStatus.FORBIDDEN,
  SIGNATURE_ARTIFACT_NOT_FOUND: HttpStatus.NOT_FOUND,
};

@Catch(DomainError)
export class SignatureErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status).json({ error: { code: exception.code, message: exception.message, requestId: request.id } });
  }
}
