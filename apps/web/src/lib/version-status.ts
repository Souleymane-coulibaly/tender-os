/**
 * Cycle de vie d'une VERSION — modèle de document, prompt, thème, modèle de livrable, modèle
 * d'export. Côté API, c'est le même triplet partout (`VersionLifecycleStatus`,
 * `PromptVersionStatus`, `DocumentTemplateVersionStatus`) : une seule table, jamais une par écran.
 */
export const VERSION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  ACTIVE: "Active",
  ARCHIVED: "Archivée",
};
