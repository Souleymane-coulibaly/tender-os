import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  // Erreurs cross-module déléguées à Tenders/Client Portfolio/Documents — mêmes codes que leurs
  // propres error filters (même motif que DeliverableErrorFilter).
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TENDER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  CLIENT_ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ACCOUNT_ARCHIVED: HttpStatus.CONFLICT,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,

  ADMINISTRATIVE_DOSSIER_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_ADMINISTRATIVE_DOSSIER: HttpStatus.CONFLICT,
  ADMINISTRATIVE_REQUIREMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_ADMINISTRATIVE_REQUIREMENT_VALIDATION_STATUS_TRANSITION: HttpStatus.CONFLICT,
  ADMINISTRATIVE_DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  ADMINISTRATIVE_DOCUMENT_REVISION_NOT_FOUND: HttpStatus.NOT_FOUND,
  IMMUTABLE_ADMINISTRATIVE_DOCUMENT_REVISION: HttpStatus.CONFLICT,
  INVALID_ADMINISTRATIVE_DOCUMENT_REVISION_STATUS_TRANSITION: HttpStatus.CONFLICT,
  ADMINISTRATIVE_DOCUMENT_NOT_READY_FOR_VALIDATION: HttpStatus.UNPROCESSABLE_ENTITY,
  ADMINISTRATIVE_DOCUMENT_ALREADY_VALIDATED_WITH_DIFFERENT_REVISION: HttpStatus.CONFLICT,
  DOCUMENT_NOT_USABLE_FOR_ADMINISTRATIVE_DOCUMENT: HttpStatus.UNPROCESSABLE_ENTITY,
  ADMINISTRATIVE_DOSSIER_PERMISSION_MISSING: HttpStatus.FORBIDDEN,

  // Sprint 8C Phase 2
  INVALID_ADMINISTRATIVE_SIGNATURE_STATUS_TRANSITION: HttpStatus.CONFLICT,
  ADMINISTRATIVE_SIGNATURE_NOT_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  ADMINISTRATIVE_SIGNATURE_MODE_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
  CONSORTIUM_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_CONSORTIUM: HttpStatus.CONFLICT,
  CONSORTIUM_MANDATAIRE_NOT_A_MEMBER: HttpStatus.UNPROCESSABLE_ENTITY,
  CONSORTIUM_MEMBER_PERCENTAGES_EXCEED_100: HttpStatus.UNPROCESSABLE_ENTITY,
  DC1_DECLARATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_DC1_DECLARATION: HttpStatus.CONFLICT,
  DC2_DECLARATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_DC2_DECLARATION: HttpStatus.CONFLICT,
  DUME_DECLARATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_DUME_DECLARATION: HttpStatus.CONFLICT,
  SUBCONTRACTOR_DECLARATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_SUBCONTRACTOR_AMOUNT: HttpStatus.UNPROCESSABLE_ENTITY,
  SUBCONTRACTOR_AMOUNT_INCONSISTENT_WITH_PRICING: HttpStatus.UNPROCESSABLE_ENTITY,
  ENGAGEMENT_ACT_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_ENGAGEMENT_ACT: HttpStatus.CONFLICT,
  ENGAGEMENT_ACT_PRICING_ALREADY_FROZEN: HttpStatus.CONFLICT,
  PRICING_ESTIMATE_NOT_FOR_THIS_TENDER: HttpStatus.UNPROCESSABLE_ENTITY,
  SIGNING_POWER_NOT_FOUND: HttpStatus.NOT_FOUND,
  PRICING_ESTIMATE_NOT_FOUND: HttpStatus.NOT_FOUND,
  PRICING_ESTIMATE_VERSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  PRICING_PERMISSION_MISSING: HttpStatus.FORBIDDEN,

  // Sprint 8C Phase 3 (génération PDF/XML)
  ENGAGEMENT_ACT_PRICING_NOT_FROZEN: HttpStatus.UNPROCESSABLE_ENTITY,
  DC2_DECLARATION_HAS_NO_VERSION: HttpStatus.UNPROCESSABLE_ENTITY,
  DUME_DECLARATION_HAS_NO_VERSION: HttpStatus.UNPROCESSABLE_ENTITY,

  // Sprint 8C.1 (formulaires officiels remplissables)
  OFFICIAL_ADMINISTRATIVE_TEMPLATE_NOT_FOUND: HttpStatus.NOT_FOUND,
  ADMINISTRATIVE_FORM_DRAFT_NOT_FOUND: HttpStatus.NOT_FOUND,
  BUYER_PROVIDED_FORM_TEMPLATE_NOT_FOUND: HttpStatus.NOT_FOUND,
  UNSUPPORTED_ADMINISTRATIVE_FORM_TYPE: HttpStatus.UNPROCESSABLE_ENTITY,
  ADMINISTRATIVE_FORM_NOT_READY_FOR_GENERATION: HttpStatus.UNPROCESSABLE_ENTITY,

  // V2 Sprint 11 (préremplissage des formulaires officiels réels) — cette route réutilise
  // directement `DocumentGenerationExecutionService` (module `document-generation`), dont les
  // erreurs de domaine peuvent donc remonter jusqu'ici — mêmes codes/statuts que
  // `DocumentGenerationErrorFilter`, jamais une correspondance divergente pour la même erreur.
  OFFICIAL_FORM_TEMPLATE_NOT_CONFIGURED: HttpStatus.UNPROCESSABLE_ENTITY,
  NO_ACTIVE_DOCUMENT_TEMPLATE_VERSION: HttpStatus.UNPROCESSABLE_ENTITY,
  REQUIRED_FIELDS_MISSING: HttpStatus.UNPROCESSABLE_ENTITY,
  DOCX_MERGE_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
  SUBCONTRACTOR_PROFILE_NOT_FOUND: HttpStatus.NOT_FOUND,

  // V2 Sprint 11B (DC2 — finalisation administrative)
  CONSORTIUM_MEMBER_NOT_FOUND: HttpStatus.NOT_FOUND,

  // Checkpoint TENDEROS-2.1-P2.3-E1.3/E1.4 (correctif — mapping manquant depuis l'ajout du gate
  // entitlement E1.3, découvert pendant l'audit Pricing Schedule E1.4) — même code que DCE/Analyse/
  // Mémoire technique/SubmissionPackage/Submission/Chiffrage : sans cette entrée, un refus
  // d'entitlement remontait 500 au lieu de 402.
  TENDER_OPERATION_NOT_ENTITLED: HttpStatus.PAYMENT_REQUIRED,
};

@Catch(DomainError)
export class AdministrativeDossierErrorFilter implements ExceptionFilter {
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
