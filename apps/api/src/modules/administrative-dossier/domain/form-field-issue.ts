/**
 * Sprint 8C.1 — un champ manquant/en avertissement d'un formulaire officiel, calculé côté BACKEND
 * (mission §19/§25 — jamais recalculé côté frontend). `blocking` distingue un champ qui empêche la
 * génération d'un champ simplement recommandé.
 */
export type FormFieldIssue = Readonly<{
  fieldPath: string;
  code: string;
  message: string;
  severity: "ERROR" | "WARNING";
  blocking: boolean;
  suggestedAction?: string | undefined;
}>;
