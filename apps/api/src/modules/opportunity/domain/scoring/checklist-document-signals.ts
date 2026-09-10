import type { ChecklistDocumentSignals } from "./compute-go-no-go-report";

/**
 * TENDEROS-2.1 — fusion des « Pièces demandées » dans la Checklist.
 *
 * Le GO/NO-GO mesurait la charge et la complétude documentaires sur `TenderRequestedDocument`, que
 * plus rien n'alimentait automatiquement depuis le V2 Sprint 6. Les pièces sont désormais des
 * éléments de checklist : ce module traduit la checklist en ces mêmes signaux, sans changer leur
 * forme ni la manière dont `computeGoNoGoReport` les note.
 *
 * Seuls les éléments qui désignent une PIÈCE à produire comptent. Une visite, une échéance, un
 * livrable ou une exigence technique ne sont pas des pièces : les compter fausserait la
 * « complétude documentaire administrative » que ces signaux alimentent.
 */
export const DOCUMENTARY_CHECKLIST_TYPES: ReadonlySet<string> = new Set([
  "ADMINISTRATIVE_DOCUMENT",
  "TECHNICAL_DOCUMENT",
  "FINANCIAL_DOCUMENT",
  "CERTIFICATION",
  "INSURANCE",
  "DECLARATION",
  "FORM",
  "SIGNATURE",
]);

/** Forme minimale lue — jamais l'entité Tenders elle-même : `opportunity` ne dépend pas de son domaine. */
export type ChecklistDocumentInput = Readonly<{
  type: string;
  required: boolean;
  criticality: string;
  complianceStatus: string;
}>;

/**
 * « Fournie » = READY ou VALIDATED, soit exactement PROVIDED ou VALIDATED de l'ancienne pièce
 * demandée : la migration a repris une pièce PROVIDED avec document en READY. Un élément
 * NOT_APPLICABLE est exclu : une pièce déclarée sans objet n'est ni due, ni manquante.
 * « Éliminatoire » = criticité BLOCKING, où la migration a reporté `isEliminatory`.
 */
export function toChecklistDocumentSignals(items: readonly ChecklistDocumentInput[]): ChecklistDocumentSignals {
  const documentary = items.filter((item) => DOCUMENTARY_CHECKLIST_TYPES.has(item.type) && item.complianceStatus !== "NOT_APPLICABLE");
  const isProvided = (item: ChecklistDocumentInput) => item.complianceStatus === "READY" || item.complianceStatus === "VALIDATED";
  const required = documentary.filter((item) => item.required);
  const eliminatory = documentary.filter((item) => item.criticality === "BLOCKING");

  return {
    total: documentary.length,
    required: required.length,
    eliminatory: eliminatory.length,
    eliminatoryUnprovided: eliminatory.filter((item) => !isProvided(item)).length,
    requiredUnprovided: required.filter((item) => !isProvided(item)).length,
  };
}
