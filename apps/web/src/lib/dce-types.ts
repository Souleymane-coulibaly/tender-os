export type DceSummary = {
  id: string;
  organizationId: string;
  tenderId: string;
  status: "DRAFT" | "IMPORTED";
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type DceDocumentSummary = {
  dceId: string;
  documentId: string;
  originalFilename: string;
  sanitizedFilename: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  checksum: string;
  currentVersionNumber: number;
  createdByUserId: string;
  createdAt: string;
};

export type DceImportRejection = { originalFilename: string; reason: string };

export type DceImportResult = {
  accepted: DceDocumentSummary[];
  rejected: DceImportRejection[];
};

/** Miroir cote UI de ROLE_DCE_PERMISSIONS (dce-permission.ts) — sert uniquement a griser/masquer
 *  une action ; la seule autorite reelle reste la revalidation backend (meme motif que
 *  documents-types.ts/AUDIT-005). */
const ADMIN_TIER = ["ORGANIZATION_ADMIN", "BID_MANAGER"];
const CONTRIBUTOR_TIER = ["CONTRIBUTOR"];

export function canImportOrReplaceDceDocument(role: string | undefined): boolean {
  return role !== undefined && (ADMIN_TIER.includes(role) || CONTRIBUTOR_TIER.includes(role));
}

export function canDeleteDceDocument(role: string | undefined): boolean {
  return role !== undefined && ADMIN_TIER.includes(role);
}

export function formatDceFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} o`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} Ko`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} Mo`;
}
