export const PromptVersionStatus = {
  Draft: "DRAFT",
  Active: "ACTIVE",
  Archived: "ARCHIVED",
} as const;

export type PromptVersionStatus = (typeof PromptVersionStatus)[keyof typeof PromptVersionStatus];

/** Même discipline que RoutingPolicyStatus (ai-benchmark) — table de transitions explicite. */
export const ALLOWED_PROMPT_VERSION_TRANSITIONS: Record<PromptVersionStatus, readonly PromptVersionStatus[]> = {
  [PromptVersionStatus.Draft]: [PromptVersionStatus.Active, PromptVersionStatus.Archived],
  [PromptVersionStatus.Active]: [PromptVersionStatus.Archived],
  [PromptVersionStatus.Archived]: [],
};
