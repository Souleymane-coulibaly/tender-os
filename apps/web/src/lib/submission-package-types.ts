export type PackageFileSummary = {
  archivePath: string;
  sourceType: string;
  sourceId?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  order: number;
};

export type SubmissionPackageSummary = {
  id: string;
  tenderId: string;
  version: number;
  status: string;
  validationRunId: string;
  approvalId: string;
  readinessStatus: string;
  files: PackageFileSummary[];
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  fileHash?: string;
  createdAt: string;
  completedAt?: string;
  errorCode?: string;
  errorMessage?: string;
};

export const PACKAGE_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  GENERATING: "Génération en cours",
  COMPLETED: "Terminé",
  FAILED: "Échec",
};

export const PACKAGE_FILE_SOURCE_LABELS: Record<string, string> = {
  EXPORT_ARTIFACT: "Document exporté",
  SIGNATURE_ARTIFACT: "Pièce de signature",
  MANIFEST: "Manifest",
};

export function packageStatusBadgeClass(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "bg-green-100 text-green-800";
    case "GENERATING":
    case "PENDING":
      return "bg-amber-100 text-amber-800";
    case "FAILED":
      return "bg-red-100 text-red-800";
    default:
      return "bg-neutral-200 text-neutral-700";
  }
}

/** Mission Sprint 8A bis §52 — "Créer un package : règle stricte" (`ClientPermission.ApproveExport`).
 *  Vérification UI uniquement, jamais une autorité — le backend revalide systématiquement. */
export function canCreateSubmissionPackage(role: string | undefined): boolean {
  return role !== undefined && ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER"].includes(role);
}
