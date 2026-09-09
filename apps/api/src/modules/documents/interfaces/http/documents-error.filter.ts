import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  // Erreur cross-module réelle : ListTenderDocuments/AttachDocumentToTender appellent
  // directement GetTenderUseCase de Tenders (conception §D, §K) et laissent son
  // TenderNotFoundError remonter tel quel plutôt que de le re-envelopper — voir le
  // commentaire dans attach-document-to-tender.use-case.ts.
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  DOCUMENT_VERSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  DOCUMENT_ARCHIVED: HttpStatus.CONFLICT,
  DOCUMENT_DELETED: HttpStatus.CONFLICT,
  DOCUMENT_NOT_ARCHIVED: HttpStatus.CONFLICT,
  DOCUMENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  DOCUMENT_ACCESS_NARROWED: HttpStatus.FORBIDDEN,
  INVALID_DOCUMENT_ORIGIN: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_DOCUMENT_DOMAIN: HttpStatus.UNPROCESSABLE_ENTITY,
  CONCURRENT_VERSION_CREATION: HttpStatus.CONFLICT,
  DUPLICATE_DOCUMENT_TENDER_ASSOCIATION: HttpStatus.CONFLICT,
  DOCUMENT_TENDER_ASSOCIATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_NOT_FOUND_FOR_ASSOCIATION: HttpStatus.NOT_FOUND,
  EMPTY_FILE: HttpStatus.UNPROCESSABLE_ENTITY,
  FILE_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  UNSUPPORTED_FILE_TYPE: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  INVALID_FILENAME: HttpStatus.UNPROCESSABLE_ENTITY,

  // Erreurs cross-module réelles (mission Sprint 5.1) — même motif que TENDER_NOT_FOUND
  // ci-dessus : Client Portfolio (via GetTenderUseCase) laisse ses erreurs remonter telles quelles.
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
};

@Catch(DomainError)
export class DocumentsErrorFilter implements ExceptionFilter {
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
