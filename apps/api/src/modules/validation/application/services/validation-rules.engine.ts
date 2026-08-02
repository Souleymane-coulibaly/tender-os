import { ValidationSeverity } from "../../domain/validation-severity";

const MIN_PARAGRAPH_LENGTH = 40;

export type ValidationEngineIssue = Readonly<{
  ruleCode: string;
  severity: ValidationSeverity;
  message: string;
  resourceType?: string | undefined;
  resourceId?: string | undefined;
  source: string;
  recommendation?: string | undefined;
}>;

export type ValidationEngineSectionInput = Readonly<{
  sectionId: string;
  label: string;
  mandatory: boolean;
  selected: boolean;
  sourceType?: string | undefined;
  validationStatus?: string | undefined;
  textLength?: number | undefined;
}>;

export type ValidationEngineInput = Readonly<{
  exportJobId: string;
  sections: readonly ValidationEngineSectionInput[];
}>;

/**
 * Mission Sprint 8A §26/§29 — moteur de validation PUR (aucune E/S) : chaque règle produit une
 * `ValidationEngineIssue` explicite, jamais un score opaque. N'implémente que les contrôles
 * réellement vérifiables avec les données du domaine Export (mission "n'utilise que les statuts
 * réellement nécessaires") — les contrôles de signature/package sont de la responsabilité des
 * modules Signature/Package eux-mêmes, jamais dupliqués ici.
 */
export function runValidationRules(input: ValidationEngineInput): ValidationEngineIssue[] {
  const issues: ValidationEngineIssue[] = [];

  for (const section of input.sections) {
    if (section.mandatory && !section.selected) {
      issues.push({
        ruleCode: "MANDATORY_SECTION_MISSING",
        severity: ValidationSeverity.Blocking,
        message: `La section obligatoire "${section.label}" n'est pas renseignée.`,
        resourceType: "EXPORT_SECTION",
        resourceId: section.sectionId,
        source: "EXPORT",
        recommendation: "Sélectionner un contenu pour cette section avant de poursuivre.",
      });
      continue;
    }
    if (!section.selected) continue;

    if (section.sourceType === "GENERATION" && section.validationStatus === "NOT_VALIDATED") {
      issues.push({
        ruleCode: "UNVALIDATED_CONTENT",
        severity: ValidationSeverity.Blocking,
        message: `Le contenu généré pour la section "${section.label}" n'a pas encore été validé par un humain.`,
        resourceType: "EXPORT_SECTION",
        resourceId: section.sectionId,
        source: "GENERATION",
        recommendation: "Faire valider cette génération avant l'approbation finale.",
      });
    }

    if (typeof section.textLength === "number" && section.textLength > 0 && section.textLength < MIN_PARAGRAPH_LENGTH) {
      issues.push({
        ruleCode: "SHORT_CONTENT",
        severity: ValidationSeverity.Warning,
        message: `Le contenu de la section "${section.label}" est particulièrement court (${section.textLength} caractères).`,
        resourceType: "EXPORT_SECTION",
        resourceId: section.sectionId,
        source: "EXPORT",
        recommendation: "Vérifier que cette section est complète.",
      });
    }
  }

  return issues;
}
