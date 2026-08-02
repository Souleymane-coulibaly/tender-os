/**
 * Cycle de vie partagé par `DeliverableTemplateVersion` et `DocumentThemeVersion` (mission §5/§6) —
 * même discipline que `ExportTemplateVersionStatus`/`PromptVersionStatus` : DRAFT → ACTIVE →
 * ARCHIVED, jamais de retour arrière ("une version active est immuable").
 */
export const VersionLifecycleStatus = {
  Draft: "DRAFT",
  Active: "ACTIVE",
  Archived: "ARCHIVED",
} as const;

export type VersionLifecycleStatus = (typeof VersionLifecycleStatus)[keyof typeof VersionLifecycleStatus];

export const ALLOWED_VERSION_LIFECYCLE_TRANSITIONS: Record<VersionLifecycleStatus, readonly VersionLifecycleStatus[]> = {
  [VersionLifecycleStatus.Draft]: [VersionLifecycleStatus.Active],
  [VersionLifecycleStatus.Active]: [VersionLifecycleStatus.Archived],
  [VersionLifecycleStatus.Archived]: [],
};
