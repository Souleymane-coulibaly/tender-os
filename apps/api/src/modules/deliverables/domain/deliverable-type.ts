/**
 * Mission Sprint 8A.1 §3/§14 — les 9 livrables minimum de l'espace Livrables. Périmètre retenu
 * (décision de portée, voir rapport §B) : profondeur complète (structure/versions/révisions/revue)
 * réservée à `TechnicalMemo`/`ExecutiveSummary` ; overlay léger (édition directe, sans révision) pour
 * `ComplianceMatrix`/`Checklist`/`Annexes` ; vue lecture seule agrégée depuis un autre module pour
 * `ValidationReport`/`CostReport`/`SignatureDocuments`/`SubmissionPackage` — jamais une seconde
 * écriture sur les données de Validation/Pricing/Signature/SubmissionPackage.
 */
export const DeliverableType = {
  TechnicalMemo: "TECHNICAL_MEMO",
  ExecutiveSummary: "EXECUTIVE_SUMMARY",
  ComplianceMatrix: "COMPLIANCE_MATRIX",
  Checklist: "CHECKLIST",
  ValidationReport: "VALIDATION_REPORT",
  CostReport: "COST_REPORT",
  Annexes: "ANNEXES",
  SignatureDocuments: "SIGNATURE_DOCUMENTS",
  SubmissionPackage: "SUBMISSION_PACKAGE",
} as const;

export type DeliverableType = (typeof DeliverableType)[keyof typeof DeliverableType];

/** Types dotés d'une structure de sections versionnées/éditables/générables par IA (mission §4). */
export const STRUCTURED_DELIVERABLE_TYPES: readonly DeliverableType[] = [DeliverableType.TechnicalMemo, DeliverableType.ExecutiveSummary];

/** Types en overlay léger — entrées éditables directement, jamais de révision/relecture (mission §14). */
export const OVERLAY_DELIVERABLE_TYPES: readonly DeliverableType[] = [DeliverableType.ComplianceMatrix, DeliverableType.Checklist, DeliverableType.Annexes];

/** Types en lecture seule, entièrement dérivés d'un autre module (mission §14 "jamais une seconde écriture"). */
export const READ_ONLY_DELIVERABLE_TYPES: readonly DeliverableType[] = [
  DeliverableType.ValidationReport,
  DeliverableType.CostReport,
  DeliverableType.SignatureDocuments,
  DeliverableType.SubmissionPackage,
];

export function isDeliverableType(value: string): value is DeliverableType {
  return Object.values(DeliverableType).includes(value as DeliverableType);
}

export function isStructuredDeliverableType(type: DeliverableType): boolean {
  return STRUCTURED_DELIVERABLE_TYPES.includes(type);
}

export function isOverlayDeliverableType(type: DeliverableType): boolean {
  return OVERLAY_DELIVERABLE_TYPES.includes(type);
}

export function isReadOnlyDeliverableType(type: DeliverableType): boolean {
  return READ_ONLY_DELIVERABLE_TYPES.includes(type);
}
