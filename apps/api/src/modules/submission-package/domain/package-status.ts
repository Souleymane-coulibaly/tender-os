export const PackageStatus = {
  Pending: "PENDING",
  Generating: "GENERATING",
  Completed: "COMPLETED",
  Failed: "FAILED",
} as const;

export type PackageStatus = (typeof PackageStatus)[keyof typeof PackageStatus];

const ALLOWED_TRANSITIONS: Record<PackageStatus, readonly PackageStatus[]> = {
  [PackageStatus.Pending]: [PackageStatus.Generating],
  [PackageStatus.Generating]: [PackageStatus.Completed, PackageStatus.Failed],
  [PackageStatus.Completed]: [],
  [PackageStatus.Failed]: [],
};

export function canTransitionPackageStatus(from: PackageStatus, to: PackageStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
