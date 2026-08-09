import type { AdministrativeFormFieldStatus } from "./administrative-form-field-status";
import type { FormFieldSource } from "./form-field-source";

/** V2 Sprint 11 — un champ du formulaire officiel RÉEL (DOCX gouvernemental rempli via le moteur
 *  Sprint 10), résolu depuis les données métier réelles. Distinct de `FormFieldIssue`/mapDc4Form
 *  (Sprint 8C.1 — annexe TenderOS complémentaire, jamais le formulaire officiel lui-même) :
 *  ce type porte le résultat du NOUVEAU pipeline "vrai DOCX officiel", jamais une seconde
 *  implémentation de l'ancien. `value` n'est jamais fourni pour un champ `NOT_APPLICABLE`/`MISSING`
 *  — jamais une valeur inventée pour combler une absence (mission §19). */
export type AdministrativeFormFieldReadiness = Readonly<{
  fieldKey: string;
  label: string;
  status: AdministrativeFormFieldStatus;
  required: boolean;
  value?: string | boolean | undefined;
  source?: FormFieldSource | undefined;
  reviewReason?: string | undefined;
}>;

export type AdministrativeFormReadiness = Readonly<{
  documentType: "DC1" | "DC2" | "DC4";
  fields: readonly AdministrativeFormFieldReadiness[];
  applicableFieldCount: number;
  availableFieldCount: number;
  missingFieldKeys: readonly string[];
  needsReviewFieldKeys: readonly string[];
  readinessPercentage: number;
}>;

/** Fonction PURE, réutilisée par les deux résolveurs (DC1/DC4) — jamais un second calcul divergent
 *  du pourcentage/de la liste des champs manquants (mission §20 "jamais un pourcentage inventé"). */
export function summarizeAdministrativeFormReadiness(documentType: "DC1" | "DC2" | "DC4", fields: readonly AdministrativeFormFieldReadiness[]): AdministrativeFormReadiness {
  const applicable = fields.filter((f) => f.status !== "NOT_APPLICABLE");
  const available = applicable.filter((f) => f.status === "AVAILABLE");
  const missing = applicable.filter((f) => f.status === "MISSING").map((f) => f.fieldKey);
  const needsReview = applicable.filter((f) => f.status === "NEEDS_REVIEW").map((f) => f.fieldKey);
  return {
    documentType,
    fields,
    applicableFieldCount: applicable.length,
    availableFieldCount: available.length,
    missingFieldKeys: missing,
    needsReviewFieldKeys: needsReview,
    readinessPercentage: applicable.length === 0 ? 0 : Math.round((available.length / applicable.length) * 100),
  };
}
