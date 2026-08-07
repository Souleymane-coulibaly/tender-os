import { DomainError } from "../../../shared-kernel/domain-error";

/** V2 Sprint 4 §11 — aucun mapper d'entité n'est enregistré pour cet `entityType` (Question/Clause
 *  findings restent informatifs, jamais appliqués — mission §9). */
export class UnsupportedAiSuggestionEntityTypeError extends DomainError {
  readonly code = "AI_SUGGESTION_BRIDGE_UNSUPPORTED_ENTITY_TYPE";
  constructor(entityType: string) {
    super(`Le type de suggestion "${entityType}" ne peut pas être appliqué automatiquement à une donnée métier.`);
  }
}

/** V2 Sprint 4 §12 — la cible porte déjà une valeur : une décision explicite est exigée avant
 *  toute application (KEEP_CURRENT | REPLACE | MERGE | REJECT), jamais un écrasement silencieux. */
export class AiSuggestionTargetConflictError extends DomainError {
  readonly code = "AI_SUGGESTION_TARGET_CONFLICT";
  constructor() {
    super("La cible de cette suggestion porte déjà une valeur : une décision explicite (conserver / remplacer / fusionner / rejeter) est requise.");
  }
}

/** V2 Sprint 4 §12 — MERGE demandé sur un champ/une paire de valeurs qui ne s'y prête pas (dates,
 *  montants, statuts, booléens, SIRET, pondérations, identifiants juridiques...). */
export class AiSuggestionMergeNotAllowedError extends DomainError {
  readonly code = "AI_SUGGESTION_MERGE_NOT_ALLOWED";
  constructor() {
    super("La fusion n'est pas autorisée pour ce champ — choisissez KEEP_CURRENT, REPLACE ou REJECT.");
  }
}

/** Le lot ciblé par `parentLotId` n'appartient pas au Tender de la suggestion (`parentTenderId`) —
 *  même motif que `TenderLotMismatchError` (module tenders), jamais révéler l'existence d'un lot
 *  d'un autre Tender. */
export class AiSuggestionLotMismatchError extends DomainError {
  readonly code = "AI_SUGGESTION_LOT_MISMATCH";
  constructor() {
    super("Ce lot n'appartient pas à l'appel d'offres de cette suggestion.");
  }
}
