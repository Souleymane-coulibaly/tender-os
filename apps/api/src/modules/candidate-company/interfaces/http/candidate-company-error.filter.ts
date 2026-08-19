import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  // Mission §"jamais 403, toujours 404" pour un acteur sans accès structurel — même convention que
  // `ClientPortfolioErrorFilter`.
  CANDIDATE_COMPANY_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_CANDIDATE_COMPANY_NAME: HttpStatus.CONFLICT,
  INVALID_CANDIDATE_COMPANY_STATUS: HttpStatus.UNPROCESSABLE_ENTITY,
  CANDIDATE_COMPANY_ARCHIVED: HttpStatus.CONFLICT,
  INVALID_SIREN: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_SIRET: HttpStatus.UNPROCESSABLE_ENTITY,
  DUPLICATE_CANDIDATE_ESTABLISHMENT_SIRET: HttpStatus.CONFLICT,
  CANDIDATE_ESTABLISHMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_PRINCIPAL_CANDIDATE_ESTABLISHMENT: HttpStatus.CONFLICT,
};

@Catch(DomainError)
export class CandidateCompanyErrorFilter implements ExceptionFilter {
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
