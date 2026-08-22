import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  UNSUPPORTED_XLSX_STRUCTURE: HttpStatus.UNPROCESSABLE_ENTITY,
  CORRUPTED_XLSX_FILE: HttpStatus.UNPROCESSABLE_ENTITY,
  PRICING_SCHEDULE_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_PRICING_SCHEDULE: HttpStatus.CONFLICT,
  SOURCE_DOCUMENT_NOT_IN_DCE: HttpStatus.NOT_FOUND,
  PRICING_SCHEDULE_VERSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  PRICING_SCHEDULE_VERSION_VALIDATED: HttpStatus.CONFLICT,
  PRICING_SCHEDULE_LINE_NOT_FOUND: HttpStatus.NOT_FOUND,
  LOCKED_BUYER_FIELD: HttpStatus.FORBIDDEN,
  PRICING_SCHEDULE_VALIDATION_BLOCKED: HttpStatus.CONFLICT,
  FINANCIAL_FILE_NOT_READY: HttpStatus.CONFLICT,
  NON_PRICEABLE_LINE: HttpStatus.UNPROCESSABLE_ENTITY,

  // Erreurs cross-module réelles — jamais révéler l'existence d'une ressource inaccessible, même
  // 404 anti-énumération (même convention que Chat/Workspace/Knowledge Base/Mémoire technique).
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  TENDER_LOT_MISMATCH: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  DCE_NOT_FOUND: HttpStatus.NOT_FOUND,
  // Checkpoint TENDEROS-2.1-P2.3-E1.4 (P1 Codex) — Pricing Schedule est désormais entitlement-gated
  // (`runTenderOperationEntitled`), même motif/même code que DCE/Analyse/Mémoire technique/
  // SubmissionPackage/Submission.
  TENDER_OPERATION_NOT_ENTITLED: HttpStatus.PAYMENT_REQUIRED,
};

@Catch(DomainError)
export class PricingScheduleErrorFilter implements ExceptionFilter {
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
