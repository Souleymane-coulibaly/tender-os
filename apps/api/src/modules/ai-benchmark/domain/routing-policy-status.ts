export const RoutingPolicyStatus = {
  Draft: "DRAFT",
  Active: "ACTIVE",
  Archived: "ARCHIVED",
} as const;

export type RoutingPolicyStatus = (typeof RoutingPolicyStatus)[keyof typeof RoutingPolicyStatus];

/** Même discipline que chaque autre statut du module — table de transitions explicite. */
export const ALLOWED_ROUTING_POLICY_TRANSITIONS: Record<RoutingPolicyStatus, readonly RoutingPolicyStatus[]> = {
  [RoutingPolicyStatus.Draft]: [RoutingPolicyStatus.Active, RoutingPolicyStatus.Archived],
  [RoutingPolicyStatus.Active]: [RoutingPolicyStatus.Archived],
  [RoutingPolicyStatus.Archived]: [],
};
