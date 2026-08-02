/** Mission Sprint 8A §16/§19 — catalogue FERMÉ des types de document exportables. Extensible par un
 *  ajout ici + une migration (CHECK), jamais une chaîne libre non contrôlée (mission "aucun template
 *  exécutable non contrôlé"). */
export const ExportDocumentType = {
  TechnicalMemo: "TECHNICAL_MEMO",
  ExecutiveSummary: "EXECUTIVE_SUMMARY",
  ComplianceMatrix: "COMPLIANCE_MATRIX",
  Checklist: "CHECKLIST",
  ValidationReport: "VALIDATION_REPORT",
  CostReport: "COST_REPORT",
  SignaturePackage: "SIGNATURE_PACKAGE",
} as const;

export type ExportDocumentType = (typeof ExportDocumentType)[keyof typeof ExportDocumentType];

export function isExportDocumentType(value: string): value is ExportDocumentType {
  return (Object.values(ExportDocumentType) as string[]).includes(value);
}
