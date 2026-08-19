import { DomainError } from "../../../shared-kernel/domain-error";

export class TenderNotFoundError extends DomainError {
  readonly code = "TENDER_NOT_FOUND";
  constructor() {
    super("Tender not found.");
  }
}

export class InvalidTenderStatusTransitionError extends DomainError {
  readonly code = "INVALID_TENDER_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition tender from ${input.from} to ${input.to}.`);
  }
}

export class TenderArchivedError extends DomainError {
  readonly code = "TENDER_ARCHIVED";
  constructor() {
    super("Archived tenders cannot be modified.");
  }
}

export class TenderConcurrentModificationError extends DomainError {
  readonly code = "TENDER_CONCURRENT_MODIFICATION";
  constructor() {
    super("This tender was modified concurrently by another request. Reload and retry.");
  }
}

export class InvalidTenderStatusError extends DomainError {
  readonly code = "INVALID_TENDER_STATUS";
  constructor(value: string) {
    super(`"${value}" is not a valid tender status.`);
  }
}

export class TenderPermissionMissingError extends DomainError {
  readonly code = "TENDER_PERMISSION_MISSING";
  constructor(input: { permission: string }) {
    super(`Missing permission: ${input.permission}.`);
  }
}

export class TenderLotNotFoundError extends DomainError {
  readonly code = "TENDER_LOT_NOT_FOUND";
  constructor() {
    super("Tender lot not found.");
  }
}

export class DuplicateTenderLotNumberError extends DomainError {
  readonly code = "DUPLICATE_TENDER_LOT_NUMBER";
  constructor() {
    super("A lot with this number already exists for this tender.");
  }
}

export class TenderLotDeletedError extends DomainError {
  readonly code = "TENDER_LOT_DELETED";
  constructor() {
    super("This lot has been deleted.");
  }
}

export class TenderLotNotDeletedError extends DomainError {
  readonly code = "TENDER_LOT_NOT_DELETED";
  constructor() {
    super("Only a deleted lot can be restored.");
  }
}

export class InvalidLotReorderPayloadError extends DomainError {
  readonly code = "INVALID_LOT_REORDER_PAYLOAD";
  constructor(input: { reason: string }) {
    super(`Invalid lot reorder payload: ${input.reason}.`);
  }
}

export class ChecklistItemNotFoundError extends DomainError {
  readonly code = "CHECKLIST_ITEM_NOT_FOUND";
  constructor() {
    super("Checklist item not found.");
  }
}

export class AwardCriterionNotFoundError extends DomainError {
  readonly code = "AWARD_CRITERION_NOT_FOUND";
  constructor() {
    super("Award criterion not found.");
  }
}

export class RequestedDocumentNotFoundError extends DomainError {
  readonly code = "REQUESTED_DOCUMENT_NOT_FOUND";
  constructor() {
    super("Requested document not found.");
  }
}

export class MilestoneNotFoundError extends DomainError {
  readonly code = "MILESTONE_NOT_FOUND";
  constructor() {
    super("Milestone not found.");
  }
}

export class RiskNotFoundError extends DomainError {
  readonly code = "RISK_NOT_FOUND";
  constructor() {
    super("Risk not found.");
  }
}

export class AlertNotFoundError extends DomainError {
  readonly code = "ALERT_NOT_FOUND";
  constructor() {
    super("Alert not found.");
  }
}

export class InvalidMarketTypeError extends DomainError {
  readonly code = "INVALID_MARKET_TYPE";
  constructor(value: string) {
    super(`"${value}" is not a valid market type.`);
  }
}

export class InvalidTenderCountryError extends DomainError {
  readonly code = "INVALID_TENDER_COUNTRY";
  constructor(value: string) {
    super(`"${value}" is not a valid tender country.`);
  }
}

export class InvalidTenderLanguageError extends DomainError {
  readonly code = "INVALID_TENDER_LANGUAGE";
  constructor(value: string) {
    super(`"${value}" is not a valid tender language.`);
  }
}

export class InvalidTenderSourceError extends DomainError {
  readonly code = "INVALID_TENDER_SOURCE";
  constructor(value: string) {
    super(`"${value}" is not a valid tender source.`);
  }
}

export class InvalidLotEstimatedAmountError extends DomainError {
  readonly code = "INVALID_LOT_ESTIMATED_AMOUNT";
  constructor(input: { value: string }) {
    super(
      `"${input.value}" is not a valid estimated amount (must be a positive decimal number with at most 15 integer digits and 4 decimal digits).`,
    );
  }
}

/** V2 Sprint 3 — correctif audit Codex P1 (2e passe) : même règle que
 *  `InvalidTenderAmountRangeError`, appliquée au niveau du lot (minimumAmount/maximumAmount du
 *  lot lui-même, distinct des montants du Tender). */
export class InvalidLotAmountRangeError extends DomainError {
  readonly code = "INVALID_LOT_AMOUNT_RANGE";
  constructor() {
    super("Le montant minimum du lot ne peut pas être supérieur au montant maximum.");
  }
}

/** V2 Sprint 3 §4 — changement d'entreprise candidate refusé car le Tender a dépassé DRAFT/
 *  IN_ANALYSIS (préparation de la réponse déjà commencée). */
export class TenderCandidateChangeNotAllowedError extends DomainError {
  readonly code = "TENDER_CANDIDATE_CHANGE_NOT_ALLOWED";
  constructor(input: { status: string }) {
    super(`Impossible de changer l'entreprise candidate : ce Tender est au statut ${input.status}, seuls DRAFT et IN_ANALYSIS l'autorisent.`);
  }
}

/** V2 Sprint 26 (Checkpoint 2.1-A3) — changement d'entreprise candidate (`CandidateCompany`)
 *  refusé car le Tender a dépassé DRAFT/IN_ANALYSIS. Distinct de `TenderCandidateChangeNotAllowedError`
 *  (qui gouverne `clientAccountId`, le contexte client/portefeuille legacy) — les deux concepts ne
 *  doivent jamais être confondus (mission §21). */
export class TenderCandidateCompanyChangeNotAllowedError extends DomainError {
  readonly code = "TENDER_CANDIDATE_COMPANY_CHANGE_NOT_ALLOWED";
  constructor(input: { status: string }) {
    super(`Impossible de changer l'entreprise candidate : ce Tender est au statut ${input.status}, seuls DRAFT et IN_ANALYSIS l'autorisent.`);
  }
}

export class BuyerNotFoundError extends DomainError {
  readonly code = "BUYER_NOT_FOUND";
  constructor() {
    super("Cet acheteur est introuvable.");
  }
}

/** V2 Sprint 3 — correctif audit Codex P1 : les montants globaux du Tender (estimatedAmount/
 *  minimumAmount/maximumAmount) doivent être validés exactement comme ceux d'un lot, jamais
 *  persistés tels quels. Code distinct de INVALID_LOT_ESTIMATED_AMOUNT pour ne jamais faire
 *  croire à l'appelant qu'un lot est en cause. */
export class InvalidTenderEstimatedAmountError extends DomainError {
  readonly code = "INVALID_TENDER_ESTIMATED_AMOUNT";
  constructor(input: { value: string }) {
    super(
      `"${input.value}" is not a valid amount (must be a positive decimal number with at most 15 integer digits and 4 decimal digits).`,
    );
  }
}

/** V2 Sprint 3 — correctif audit Codex P1 : minimumAmount ne peut jamais dépasser maximumAmount
 *  lorsque les deux sont renseignés (mission §6 "montant estimatif/min/max" cohérents). */
export class InvalidTenderAmountRangeError extends DomainError {
  readonly code = "INVALID_TENDER_AMOUNT_RANGE";
  constructor() {
    super("Le montant minimum ne peut pas être supérieur au montant maximum.");
  }
}

/** V2 Sprint 3 — correctif audit Codex P1 (IDOR horizontal) : un `lotId` fourni à une sous-
 *  ressource du Tender (critère, pièce demandée, jalon, risque) doit appartenir à CE Tender —
 *  la contrainte FK composite `(lotId, organizationId)` ne suffit pas, elle ne protège que le
 *  tenant, jamais le Tender précis (un lot du Tender B de la même organisation la satisferait). */
export class TenderLotMismatchError extends DomainError {
  readonly code = "TENDER_LOT_MISMATCH";
  constructor() {
    super("Ce lot n'appartient pas à cet appel d'offres.");
  }
}

/** V2 Sprint 6 — correctif audit Codex P2 : `subjectSubcontractorProfileId` inexistant, appartenant
 *  à une autre organisation, ou pointant vers un profil archivé (retrait définitif). Un seul code,
 *  même convention anti-énumération que `TenderLotMismatchError`/`DocumentNotFoundError` — jamais
 *  distinguer "inexistant" de "autre organisation" côté réponse HTTP. */
export class ChecklistSubcontractorSubjectNotFoundError extends DomainError {
  readonly code = "CHECKLIST_SUBCONTRACTOR_SUBJECT_NOT_FOUND";
  constructor() {
    super("Ce profil sous-traitant est introuvable, ou n'est plus utilisable (archivé).");
  }
}

/** V2 Sprint 6 — correctif audit Codex P2 (cohérence du contexte) : `subjectSubcontractorProfileId`
 *  n'a de sens que si `subjectType` vaut SUBCONTRACTOR — jamais un pointeur sous-traitant conservé
 *  sur un sujet CANDIDATE/GROUP_MEMBER/ANY_MEMBER/TENDER/LOT. */
export class InvalidChecklistSubjectError extends DomainError {
  readonly code = "INVALID_CHECKLIST_SUBJECT";
  constructor() {
    super("subjectSubcontractorProfileId ne peut être renseigné que lorsque subjectType vaut SUBCONTRACTOR.");
  }
}
