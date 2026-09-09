import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  // Checkpoint TENDEROS-2.1-CCV2-G.2 — sans cette entree, la suppression du repli Legacy
  // transformerait un refus METIER parfaitement legitime (« aucune entreprise candidate n'est
  // designee ») en 500 : une panne serveur apparente la ou l'utilisateur a simplement une action a
  // faire. 422, comme partout ailleurs pour ce meme code (§9 : une seule erreur, mappee
  // uniformement).
  CANDIDATE_COMPANY_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  TECHNICAL_MEMO_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_TECHNICAL_MEMO: HttpStatus.CONFLICT,
  TECHNICAL_MEMO_SECTION_NOT_FOUND: HttpStatus.NOT_FOUND,
  TECHNICAL_MEMO_SECTION_REQUIREMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  NO_HEADINGS_DETECTED: HttpStatus.UNPROCESSABLE_ENTITY,
  TECHNICAL_MEMO_SECTION_ALREADY_VALIDATED: HttpStatus.CONFLICT,
  TECHNICAL_MEMO_TEMPLATE_NOT_READY: HttpStatus.CONFLICT,
  TECHNICAL_MEMO_CITATION_VALIDATION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
  // Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-2 (F-04) — echec REEL de generation (provider
  // indisponible/reponse invalide/timeout) : la section est persistee FAILED et l'appelant recoit un
  // code actionnable, jamais un 500 opaque. 502 : la cause est en amont, pas dans la requete.
  TECHNICAL_MEMO_SECTION_GENERATION_FAILED: HttpStatus.BAD_GATEWAY,
  // Checkpoint 2.1-P2.1-FIX-D — même famille que TECHNICAL_MEMO_TEMPLATE_NOT_READY : état actuel
  // (analyse/mémoire pas encore actualisé) empêche l'action, jamais une erreur de validation.
  TECHNICAL_MEMO_ANALYSIS_NOT_CURRENT: HttpStatus.CONFLICT,
  TECHNICAL_MEMO_STALE_EXPORT_BLOCKED: HttpStatus.CONFLICT,
  // Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 1 — jetée par `assertTenderOperationEntitled`
  // (module `billing`), même statut que INSUFFICIENT_AO_CREDITS/SEAT_LIMIT_EXCEEDED ailleurs.
  TENDER_OPERATION_NOT_ENTITLED: HttpStatus.PAYMENT_REQUIRED,

  // Erreurs cross-module réelles — jamais révéler l'existence d'une ressource inaccessible, même
  // 404 anti-énumération (même convention que Chat/Workspace/Knowledge Base/document-generation).
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  TENDER_LOT_MISMATCH: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
};

@Catch(DomainError)
export class TechnicalMemoErrorFilter implements ExceptionFilter {
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
