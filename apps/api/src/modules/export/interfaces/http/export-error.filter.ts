import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  // Erreurs cross-module déléguées à Tenders/Client Portfolio/Generation/Pricing — mêmes codes
  // que leurs propres error filters (même motif que PricingErrorFilter, Sprint 7).
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  GENERATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  PRICING_ESTIMATE_NOT_FOUND: HttpStatus.NOT_FOUND,

  EXPORT_TEMPLATE_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_EXPORT_TEMPLATE: HttpStatus.CONFLICT,
  EXPORT_TEMPLATE_VERSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  NO_ACTIVE_EXPORT_TEMPLATE_VERSION: HttpStatus.UNPROCESSABLE_ENTITY,
  EXPORT_TEMPLATE_VERSION_ACTIVATION_CONFLICT: HttpStatus.CONFLICT,
  INVALID_EXPORT_TEMPLATE_CONFIG: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_EXPORT_TEMPLATE_VERSION_STATUS_TRANSITION: HttpStatus.CONFLICT,
  EXPORT_JOB_NOT_FOUND: HttpStatus.NOT_FOUND,
  EXPORT_ARTIFACT_NOT_FOUND: HttpStatus.NOT_FOUND,
  EXPORT_NOT_FINAL: HttpStatus.UNPROCESSABLE_ENTITY,
  EXPORT_BLOCKED: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_SECTION_SELECTION: HttpStatus.UNPROCESSABLE_ENTITY,
  CROSS_CLIENT_CONTENT: HttpStatus.FORBIDDEN,
  UNRELIABLE_RENDER: HttpStatus.UNPROCESSABLE_ENTITY,
  EXPORT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
};

@Catch(DomainError)
export class ExportErrorFilter implements ExceptionFilter {
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
