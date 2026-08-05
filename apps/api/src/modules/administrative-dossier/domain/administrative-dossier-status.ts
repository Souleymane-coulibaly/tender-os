import type { AdministrativeChecklistLineState } from "./administrative-checklist";
import { AdministrativeChecklistLineState as LineState } from "./administrative-checklist";

/**
 * Sprint 8C Phase 1 — statut GLOBAL du dossier administratif, dérivé de la checklist (mission §6 —
 * "séparer strictement complétude / validité / validation humaine / signature / sélection package").
 * Ne code JAMAIS la signature ni la sélection package — des faits portés par d'autres modules,
 * ajoutés dans une phase ultérieure.
 */
export const AdministrativeDossierStatus = {
  Incomplete: "INCOMPLETE",
  ToComplete: "TO_COMPLETE",
  InVerification: "IN_VERIFICATION",
  Ready: "READY",
  Blocked: "BLOCKED",
} as const;

export type AdministrativeDossierStatus = (typeof AdministrativeDossierStatus)[keyof typeof AdministrativeDossierStatus];

/** Mission §6 — la validation humaine reste un fait séparé du statut de complétude ; `OUTDATED`
 *  signale explicitement qu'une validation antérieure ne reflète plus l'état courant (mission §21
 *  "une modification après validation... invalide ou rouvre la validation concernée"), jamais
 *  silencieusement laissée `VALIDATED`. */
export const AdministrativeDossierValidationStatus = {
  NotValidated: "NOT_VALIDATED",
  Validated: "VALIDATED",
  Outdated: "OUTDATED",
} as const;

export type AdministrativeDossierValidationStatus = (typeof AdministrativeDossierValidationStatus)[keyof typeof AdministrativeDossierValidationStatus];

/**
 * Dérivation PURE du statut global à partir des états de lignes de checklist (mission §9/§15 — même
 * discipline que `deriveChecklistDeliverableStatus`) : `BLOCKED` dès qu'une ligne obligatoire signale
 * un vrai problème (EXPIRE), `IN_VERIFICATION` si au moins une ligne obligatoire est en cours de
 * vérification/validation, `READY` seulement si toutes les lignes obligatoires sont VALIDE/PRET,
 * `TO_COMPLETE` dès qu'au moins une ligne obligatoire a progressé sans que toutes le soient,
 * `INCOMPLETE` sinon (aucune progression, ou aucune ligne).
 */
export function deriveAdministrativeDossierStatus(input: { mandatoryLineStates: readonly AdministrativeChecklistLineState[] }): AdministrativeDossierStatus {
  const { mandatoryLineStates } = input;
  if (mandatoryLineStates.length === 0) {
    return AdministrativeDossierStatus.Incomplete;
  }
  if (mandatoryLineStates.some((state) => state === LineState.Expire)) {
    return AdministrativeDossierStatus.Blocked;
  }
  const finalPositive = mandatoryLineStates.filter((state) => state === LineState.Valide || state === LineState.Pret || state === LineState.NonApplicable);
  if (finalPositive.length === mandatoryLineStates.length) {
    return AdministrativeDossierStatus.Ready;
  }
  if (mandatoryLineStates.some((state) => state === LineState.AVerifier || state === LineState.EnValidation)) {
    return AdministrativeDossierStatus.InVerification;
  }
  const progressed = mandatoryLineStates.filter((state) => state !== LineState.Manquant);
  if (progressed.length === 0) {
    return AdministrativeDossierStatus.Incomplete;
  }
  return AdministrativeDossierStatus.ToComplete;
}
