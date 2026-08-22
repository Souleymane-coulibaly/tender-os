import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  EXPORT_JOB_NOT_FOUND: HttpStatus.NOT_FOUND,
  EXPORT_NOT_FINAL: HttpStatus.UNPROCESSABLE_ENTITY,
  EXPORT_BLOCKED: HttpStatus.UNPROCESSABLE_ENTITY,

  VALIDATION_RUN_NOT_FOUND: HttpStatus.NOT_FOUND,
  VALIDATION_ISSUE_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_RESOLUTION_TRANSITION: HttpStatus.CONFLICT,
  BLOCKING_ISSUES_OPEN: HttpStatus.UNPROCESSABLE_ENTITY,
  FINAL_APPROVAL_NOT_FOUND: HttpStatus.NOT_FOUND,
  APPROVAL_ALREADY_INVALIDATED: HttpStatus.CONFLICT,
  MANIFEST_MISMATCH: HttpStatus.CONFLICT,

  // Checkpoint TENDEROS-2.1-P2.3-E1.3/E1.4 (correctif — mapping manquant depuis l'ajout du gate
  // entitlement E1.3, découvert pendant l'audit Pricing Schedule E1.4).
  TENDER_OPERATION_NOT_ENTITLED: HttpStatus.PAYMENT_REQUIRED,
};

@Catch(DomainError)
export class ValidationErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status).json({ error: { code: exception.code, message: exception.message, requestId: request.id } });
  }
}
