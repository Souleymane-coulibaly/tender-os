import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  // Erreurs cross-module réelles : DCE délègue à Tenders (GetTenderUseCase) et à Documents
  // (CreateDocumentWithFirstVersionUseCase, AddDocumentVersionUseCase, DeleteDocumentUseCase,
  // DownloadDocumentVersionUseCase, GetDocumentUseCase) et laisse leurs erreurs remonter telles
  // quelles plutôt que de les ré-envelopper — même motif que DocumentsErrorFilter pour
  // TENDER_NOT_FOUND.
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  DOCUMENT_VERSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  DOCUMENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  // Mission Sprint 8A.2 — GetDceImportJobUseCase est le premier chemin DCE à atteindre
  // AssertClientAccessUseCase (via GetTenderUseCase) pour un acteur restreint : sans ces deux
  // entrées (déjà présentes dans TOUS les autres filtres du projet), ces codes retombaient sur
  // 500, jamais observé avant faute d'un chemin de lecture DCE les exerçant. CLIENT_ACCOUNT_NOT_FOUND
  // reste un 404 (jamais 403) — même logique anti-énumération que partout ailleurs : un acteur sans
  // accès à un client ne doit jamais pouvoir distinguer "n'existe pas" de "accès refusé".
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  // Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 1 — jetée par `assertTenderOperationEntitled`
  // (module `billing`), même statut que INSUFFICIENT_AO_CREDITS/SEAT_LIMIT_EXCEEDED ailleurs.
  TENDER_OPERATION_NOT_ENTITLED: HttpStatus.PAYMENT_REQUIRED,

  DCE_NOT_FOUND: HttpStatus.NOT_FOUND,
  DCE_ALREADY_EXISTS: HttpStatus.CONFLICT,
  DCE_DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_DCE_STATUS: HttpStatus.UNPROCESSABLE_ENTITY,
  DCE_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  TENDER_ARCHIVED_FOR_DCE_MUTATION: HttpStatus.CONFLICT,
  TOO_MANY_FILES: HttpStatus.UNPROCESSABLE_ENTITY,
  DCE_EMPTY_FILE: HttpStatus.UNPROCESSABLE_ENTITY,
  DCE_FILE_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  DCE_UNSUPPORTED_FILE_TYPE: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  DCE_INVALID_FILENAME: HttpStatus.UNPROCESSABLE_ENTITY,
  ZIP_SECURITY_VIOLATION: HttpStatus.UNPROCESSABLE_ENTITY,
};

@Catch(DomainError)
export class DceErrorFilter implements ExceptionFilter {
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
