import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { TenderNotReadyForSubmissionError } from "../../domain/errors";

const STATUS_BY_CODE: Record<string, number> = {
  // Erreurs cross-module déléguées à Tenders/Client Portfolio/Documents/Submission Package —
  // mêmes codes que leurs propres error filters (même motif que AdministrativeDossierErrorFilter).
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  SUBMISSION_PACKAGE_NOT_FOUND: HttpStatus.NOT_FOUND,

  // Sprint 9
  TENDER_SUBMISSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  SUBMISSION_PROOF_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_NOT_READY_FOR_SUBMISSION: HttpStatus.UNPROCESSABLE_ENTITY,
  SUBMISSION_PACKAGE_MISSING: HttpStatus.UNPROCESSABLE_ENTITY,
  SUBMISSION_PACKAGE_OUTDATED: HttpStatus.UNPROCESSABLE_ENTITY,
  SUBMISSION_PACKAGE_VERSION_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
  SUBMISSION_DEADLINE_PASSED: HttpStatus.UNPROCESSABLE_ENTITY,
  SUBMISSION_PROOF_CROSS_ORGANIZATION: HttpStatus.NOT_FOUND,
  TENDER_SUBMISSION_ALREADY_REPLACED: HttpStatus.CONFLICT,
  INVALID_TENDER_SUBMISSION_STATUS_TRANSITION: HttpStatus.CONFLICT,
  TENDER_SUBMISSION_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  ACTIVE_TENDER_SUBMISSION_ALREADY_EXISTS: HttpStatus.CONFLICT,
  RECEIPT_CONFIRMATION_REQUIRES_EVIDENCE: HttpStatus.UNPROCESSABLE_ENTITY,
  CUSTOM_PLATFORM_NAME_REQUIRED: HttpStatus.BAD_REQUEST,
  DOCUMENT_NOT_USABLE_FOR_SUBMISSION_PROOF: HttpStatus.UNPROCESSABLE_ENTITY,

  // Checkpoint TENDEROS-2.1-P2.2-F2
  RESPONSE_PACKAGE_ARTIFACT_MISSING: HttpStatus.UNPROCESSABLE_ENTITY,
};

@Catch(DomainError)
export class SubmissionErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    // Checkpoint 2.1-P2.1-FIX-F.1 (mission §27) — contrat exploitable pour ce cas précis
    // uniquement : les raisons structurées (code/sévérité/action) accompagnent le message, jamais
    // un élargissement du contrat d'erreur générique des autres codes.
    const reasons = exception instanceof TenderNotReadyForSubmissionError ? exception.reasons : undefined;

    response.status(status).json({
      error: { code: exception.code, message: exception.message, requestId: request.id, ...(reasons ? { reasons } : {}) },
    });
  }
}
