import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  // Mission §"jamais 403, toujours 404" pour un acteur sans accès structurel — même convention que
  // `ClientPortfolioErrorFilter`.
  CANDIDATE_COMPANY_NOT_FOUND: HttpStatus.NOT_FOUND,
  // Checkpoint CCV2-G.1 — 422 et non 404 : l'appelant n'a désigné AUCUNE entreprise candidate.
  // Un 404 ici laisserait croire qu'une ressource demandée est introuvable, et brouillerait la
  // convention anti-énumération qui, elle, concerne une entreprise réellement désignée.
  CANDIDATE_COMPANY_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  // CCV2-A — refus lié au RÔLE de l'acteur dans sa propre organisation : 403, jamais 404. La
  // convention anti-énumération ci-dessus concerne l'EXISTENCE d'une ressource ; un 403 ici
  // n'en révèle aucune (il est levé avant toute lecture, sur le seul rôle de l'acteur).
  CANDIDATE_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  DUPLICATE_CANDIDATE_COMPANY_NAME: HttpStatus.CONFLICT,
  INVALID_CANDIDATE_COMPANY_STATUS: HttpStatus.UNPROCESSABLE_ENTITY,
  CANDIDATE_COMPANY_ARCHIVED: HttpStatus.CONFLICT,
  INVALID_SIREN: HttpStatus.UNPROCESSABLE_ENTITY,
  // Checkpoint CCV2-F.2 — sans cette entree, un numero de TVA francais invalide serait tombe dans
  // le defaut 500 : une faute de saisie utilisateur presentee comme une panne serveur.
  INVALID_VAT_NUMBER: HttpStatus.UNPROCESSABLE_ENTITY,
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
