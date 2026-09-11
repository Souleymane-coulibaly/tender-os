import type { PageResponse } from "./tenders-types";

export type { PageResponse };

export type DocumentOrigin = "USER_UPLOAD" | "DCE" | "TEMPLATE" | "GENERATED" | "IMPORTED";
export type DocumentDomain = "TENDER" | "ORGANIZATION" | "KNOWLEDGE" | "TEMPLATE" | "GENERATED";
export type DocumentStatus = "ACTIVE" | "ARCHIVED";

export type DocumentVersionSummary = {
  id: string;
  documentId: string;
  versionNumber: number;
  originalFilename: string;
  sanitizedFilename: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  checksum: string;
  uploadedByUserId: string;
  createdAt: string;
};

export type DocumentSummary = {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  origin: DocumentOrigin;
  domain: DocumentDomain;
  category?: string;
  status: DocumentStatus;
  currentVersionNumber: number;
  currentVersion?: DocumentVersionSummary;
  createdByUserId: string;
  updatedByUserId?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

export type DocumentTenderAssociationSummary = {
  documentId: string;
  tenderId: string;
  createdByUserId: string;
  createdAt: string;
};

export const DOCUMENT_ORIGIN_LABELS: Record<DocumentOrigin, string> = {
  USER_UPLOAD: "Déposé par un utilisateur",
  DCE: "Issu du DCE",
  TEMPLATE: "Modèle",
  GENERATED: "Généré",
  IMPORTED: "Importé",
};

export const DOCUMENT_DOMAIN_LABELS: Record<DocumentDomain, string> = {
  TENDER: "Appel d'offres",
  ORGANIZATION: "Organisation",
  KNOWLEDGE: "Base de connaissances",
  TEMPLATE: "Modèle",
  GENERATED: "Généré",
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  ACTIVE: "Actif",
  ARCHIVED: "Archivé",
};

/** Suggestions d'autocompletion cote frontend uniquement — `category` reste une chaine libre
 *  cote backend (conception validee), jamais une contrainte serveur. */
export const DOCUMENT_CATEGORY_SUGGESTIONS = [
  "RC",
  "CCAP",
  "CCTP",
  "AE",
  "BPU",
  "DPGF",
  "KBIS",
  "CV",
  "Mémoire technique",
  "Attestation fiscale",
  "Attestation sociale",
  "Assurance",
  "Référence",
];

/** Miroir cote UI de ROLE_DOCUMENT_PERMISSIONS (document-permission.ts) — sert uniquement a
 *  griser/masquer une action ; la seule autorite reelle reste la revalidation backend. */
// Mission Sprint 8A.2 (audit Cockpit Bid Manager) — OWNER manquait ici (miroir jamais mis à jour
// après le correctif backend OWNER de document-permission.ts), rendant l'import/édition de
// documents invisibles pour un propriétaire d'organisation bien qu'autorisé côté API.
const ADMIN_TIER = ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER"];
const CONTRIBUTOR_TIER = ["CONTRIBUTOR"];

export function canUploadOrEditDocument(role: string | undefined): boolean {
  return role !== undefined && (ADMIN_TIER.includes(role) || CONTRIBUTOR_TIER.includes(role));
}

export function canManageDocumentLifecycle(role: string | undefined): boolean {
  return role !== undefined && ADMIN_TIER.includes(role);
}

export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} o`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} Ko`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} Mo`;
}
