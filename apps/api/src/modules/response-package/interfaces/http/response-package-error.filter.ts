import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  RESPONSE_PACKAGE_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_RESPONSE_PACKAGE: HttpStatus.CONFLICT,
  RESPONSE_PACKAGE_VERSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  RESPONSE_PACKAGE_VERSION_VALIDATED: HttpStatus.CONFLICT,
  PACKAGE_ITEM_NOT_FOUND: HttpStatus.NOT_FOUND,
  RESPONSE_PACKAGE_VALIDATION_BLOCKED: HttpStatus.CONFLICT,
  PACKAGE_ARTIFACT_NOT_READY: HttpStatus.CONFLICT,
  DUPLICATE_ARCHIVE_PATH: HttpStatus.CONFLICT,
  UNSAFE_ARCHIVE_PATH: HttpStatus.UNPROCESSABLE_ENTITY,

  // Erreurs cross-module réelles — jamais révéler l'existence d'une ressource inaccessible, même
  // 404 anti-énumération (même convention que Chat/Mémoire technique/Chiffrage).
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  TENDER_LOT_MISMATCH: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,

  // Checkpoint TENDEROS-2.1-P2.3-E1.3/E1.4 (correctif — mapping manquant depuis l'ajout du gate
  // entitlement E1.3, découvert pendant l'audit Pricing Schedule E1.4).
  TENDER_OPERATION_NOT_ENTITLED: HttpStatus.PAYMENT_REQUIRED,
};

@Catch(DomainError)
export class ResponsePackageErrorFilter implements ExceptionFilter {
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
