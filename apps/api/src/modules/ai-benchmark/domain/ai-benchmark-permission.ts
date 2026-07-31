/**
 * Permissions du module ai-benchmark (Sprint 5.2 §"Permissions") — table binaire par conception :
 * seuls OWNER/ORGANIZATION_ADMIN reçoivent une capacité de mutation ; tout autre rôle organisation
 * (y compris BID_MANAGER/CONTRIBUTOR, qui ont des droits élevés sur Tenders/Analysis) n'a ici que
 * les permissions de lecture. Même motif `assertHasXPermission` que chaque autre module.
 */
export const AiBenchmarkPermission = {
  ReadModels: "AI_BENCHMARK_READ_MODELS",
  ManageModels: "AI_BENCHMARK_MANAGE_MODELS",
  ReadBenchmarks: "AI_BENCHMARK_READ_BENCHMARKS",
  LaunchBenchmark: "AI_BENCHMARK_LAUNCH_BENCHMARK",
  ReadRecommendations: "AI_BENCHMARK_READ_RECOMMENDATIONS",
  ApproveRecommendation: "AI_BENCHMARK_APPROVE_RECOMMENDATION",
  ReadRoutingPolicies: "AI_BENCHMARK_READ_ROUTING_POLICIES",
  ManageRoutingPolicies: "AI_BENCHMARK_MANAGE_ROUTING_POLICIES",
} as const;

export type AiBenchmarkPermission = (typeof AiBenchmarkPermission)[keyof typeof AiBenchmarkPermission];

const READ_PERMISSIONS: readonly AiBenchmarkPermission[] = [
  AiBenchmarkPermission.ReadModels,
  AiBenchmarkPermission.ReadBenchmarks,
  AiBenchmarkPermission.ReadRecommendations,
  AiBenchmarkPermission.ReadRoutingPolicies,
];

const ALL_PERMISSIONS: readonly AiBenchmarkPermission[] = Object.values(AiBenchmarkPermission);

export const ROLE_AI_BENCHMARK_PERMISSIONS: Record<string, readonly AiBenchmarkPermission[]> = {
  OWNER: ALL_PERMISSIONS,
  ORGANIZATION_ADMIN: ALL_PERMISSIONS,
  BID_MANAGER: READ_PERMISSIONS,
  CONTRIBUTOR: READ_PERMISSIONS,
  REVIEWER: READ_PERMISSIONS,
  EXECUTIVE: READ_PERMISSIONS,
  EXTERNAL_CONSULTANT: READ_PERMISSIONS,
  READ_ONLY: READ_PERMISSIONS,
};

export function roleHasAiBenchmarkPermission(role: string, permission: AiBenchmarkPermission): boolean {
  return (ROLE_AI_BENCHMARK_PERMISSIONS[role] ?? []).includes(permission);
}
