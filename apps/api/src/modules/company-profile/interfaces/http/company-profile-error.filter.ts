import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  // Erreurs cross-module déléguées à Client Portfolio/Documents — mêmes codes que leurs propres
  // error filters (même motif que AdministrativeDossierErrorFilter).
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,

  COMPANY_LEGAL_IDENTITY_NOT_FOUND: HttpStatus.NOT_FOUND,
  COMPANY_REPRESENTATIVE_NOT_FOUND: HttpStatus.NOT_FOUND,
  COMPANY_BANK_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  COMPANY_INSURANCE_NOT_FOUND: HttpStatus.NOT_FOUND,
  COMPANY_CERTIFICATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  COMPANY_REFERENCE_NOT_FOUND: HttpStatus.NOT_FOUND,
  COMPANY_HUMAN_RESOURCE_NOT_FOUND: HttpStatus.NOT_FOUND,
  COMPANY_MATERIAL_RESOURCE_NOT_FOUND: HttpStatus.NOT_FOUND,
  COMPANY_DOCUMENT_ASSOCIATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_COMPANY_IDENTIFIER_FORMAT: HttpStatus.UNPROCESSABLE_ENTITY,
  DUPLICATE_SIRET_IN_ORGANIZATION: HttpStatus.CONFLICT,
  BANK_ACCOUNT_NEVER_HARD_DELETED: HttpStatus.CONFLICT,
  DOCUMENT_NOT_USABLE_FOR_COMPANY_PROFILE: HttpStatus.UNPROCESSABLE_ENTITY,
  DUPLICATE_DOCUMENT_CLIENT_ACCOUNT_ASSOCIATION: HttpStatus.CONFLICT,
};

@Catch(DomainError)
export class CompanyProfileErrorFilter implements ExceptionFilter {
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
