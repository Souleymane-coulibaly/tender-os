import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  OPPORTUNITY_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_OPPORTUNITY_STATUS: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_OPPORTUNITY_STATUS_TRANSITION: HttpStatus.CONFLICT,
  INVALID_OPPORTUNITY_ESTIMATED_AMOUNT: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_OPPORTUNITY_SOURCE: HttpStatus.UNPROCESSABLE_ENTITY,
  OPPORTUNITY_ARCHIVED: HttpStatus.CONFLICT,
  OPPORTUNITY_CONCURRENT_MODIFICATION: HttpStatus.CONFLICT,
  OPPORTUNITY_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  GO_NO_GO_DECISION_JUSTIFICATION_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  GO_NO_GO_DECISION_CONDITIONS_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  GO_NO_GO_ADMIN_BYPASS_JUSTIFICATION_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_GO_NO_GO_DECISION: HttpStatus.UNPROCESSABLE_ENTITY,
  // Aucune dérogation NO_GO ce sprint (décision produit confirmée) — 409, même famille que
  // TENDER_CONCURRENT_MODIFICATION : l'état actuel diverge de ce que le client suppose.
  OPPORTUNITY_PROMOTION_REQUIRES_GO_DECISION: HttpStatus.CONFLICT,
  OPPORTUNITY_MISSING_CLIENT_ACCOUNT: HttpStatus.UNPROCESSABLE_ENTITY,
  OPPORTUNITY_PROMOTION_CONFLICT: HttpStatus.CONFLICT,
  GO_NO_GO_REPORT_NOT_FOUND: HttpStatus.NOT_FOUND,
  // Checkpoint 2.1-P2.1-FIX-C — même famille que TENDER_BUSINESS_ANALYSIS_NOT_FOUND ci-dessous :
  // état actuel (analyse pas encore actualisée) empêche l'action, jamais une erreur de validation.
  GO_NO_GO_ANALYSIS_NOT_CURRENT: HttpStatus.CONFLICT,
  OPPORTUNITY_QUICK_SCORE_NOT_FOUND: HttpStatus.NOT_FOUND,

  // Cross-module (mission §14 : le Niveau 2 exige qu'une analyse IA du DCE ait déjà réussi).
  TENDER_BUSINESS_ANALYSIS_NOT_FOUND: HttpStatus.CONFLICT,

  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  BUYER_NOT_FOUND: HttpStatus.NOT_FOUND,

  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,

  // V2 Sprint 26 (Checkpoint 2.1-A3) — Opportunity délègue à `candidate-company`
  // (CreateOpportunityUseCase/UpdateOpportunityUseCase), même motif que Client Portfolio ci-dessus.
  CANDIDATE_COMPANY_NOT_FOUND: HttpStatus.NOT_FOUND,
  CANDIDATE_COMPANY_ARCHIVED: HttpStatus.CONFLICT,
};

@Catch(DomainError)
export class OpportunityErrorFilter implements ExceptionFilter {
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
