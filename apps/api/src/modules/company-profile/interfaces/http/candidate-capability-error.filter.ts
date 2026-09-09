import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

/**
 * Checkpoint TENDEROS-2.1-CCV2-C — mapping d'erreurs des routes capacités candidate.
 *
 * Convention TenderOS strictement respectée :
 *   - ressource inexistante, d'un autre tenant, ou rattachée à un AUTRE candidat -> 404, jamais 403
 *     (aucune existence n'est jamais révélée) ;
 *   - permission insuffisante dans un tenant valide -> 403 (`CANDIDATE_PERMISSION_MISSING`), levée
 *     AVANT toute lecture, donc elle ne trahit aucune ressource.
 */
const STATUS_BY_CODE: Record<string, number> = {
  CANDIDATE_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  CANDIDATE_COMPANY_NOT_FOUND: HttpStatus.NOT_FOUND,
  COMPANY_REPRESENTATIVE_NOT_FOUND: HttpStatus.NOT_FOUND,
  COMPANY_INSURANCE_NOT_FOUND: HttpStatus.NOT_FOUND,
  COMPANY_CERTIFICATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  COMPANY_REFERENCE_NOT_FOUND: HttpStatus.NOT_FOUND,
  COMPANY_HUMAN_RESOURCE_NOT_FOUND: HttpStatus.NOT_FOUND,
  COMPANY_MATERIAL_RESOURCE_NOT_FOUND: HttpStatus.NOT_FOUND,
  COMPANY_BANK_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  // CCV2-C.1 — la forme JSON est valide, la donnée est fausse : 422, jamais 400.
  INVALID_IBAN: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_BIC: HttpStatus.UNPROCESSABLE_ENTITY,
  PRIMARY_BANK_ACCOUNT_CONFLICT: HttpStatus.CONFLICT,
  CANDIDATE_DOCUMENT_ASSOCIATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  DOCUMENT_ACCESS_NARROWED: HttpStatus.FORBIDDEN,
  DUPLICATE_DOCUMENT_CLIENT_ACCOUNT_ASSOCIATION: HttpStatus.CONFLICT,
  DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  DOCUMENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
};

@Catch(DomainError)
export class CandidateCapabilityErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status).json({ error: { code: exception.code, message: exception.message, requestId: request.id } });
  }
}
