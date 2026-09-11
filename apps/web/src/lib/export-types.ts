import type { BadgeTone } from "../components/ui";
import { VERSION_STATUS_LABELS } from "./version-status";
export type ExportTemplateVersionSummary = {
  id: string;
  exportTemplateId: string;
  version: number;
  status: string;
  format: string;
  config: unknown;
  createdBy: string;
  createdAt: string;
  activatedAt?: string;
  archivedAt?: string;
};

export type ExportTemplateSummary = {
  id: string;
  organizationId: string;
  documentType: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  activeVersion?: ExportTemplateVersionSummary;
  versions?: ExportTemplateVersionSummary[];
};

export type ExportArtifactSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  hashAlgorithm: string;
  manifest: unknown;
  warnings: string[];
  errors: string[];
  createdAt: string;
};

export type ExportJobSummary = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  exportTemplateId: string;
  exportTemplateVersionId: string;
  documentType: string;
  mode: string;
  format: string;
  status: string;
  version: number;
  basedOnExportJobId?: string;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
  errorCode?: string;
  errorMessage?: string;
  artifact?: ExportArtifactSummary;
};

export const EXPORT_DOCUMENT_TYPES = [
  "TECHNICAL_MEMO",
  "EXECUTIVE_SUMMARY",
  "COMPLIANCE_MATRIX",
  "CHECKLIST",
  "VALIDATION_REPORT",
  "COST_REPORT",
  "SIGNATURE_PACKAGE",
] as const;

export const EXPORT_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  TECHNICAL_MEMO: "Mémoire technique",
  EXECUTIVE_SUMMARY: "Résumé exécutif",
  COMPLIANCE_MATRIX: "Matrice de conformité",
  CHECKLIST: "Checklist des pièces",
  VALIDATION_REPORT: "Rapport de validation",
  COST_REPORT: "Rapport de coûts",
  SIGNATURE_PACKAGE: "Dossier de signature",
};

export const EXPORT_SECTION_SOURCES = ["GENERATION", "PRICING", "MANUAL", "ANNEX"] as const;

export const EXPORT_SECTION_SOURCE_LABELS: Record<string, string> = {
  GENERATION: "Génération IA",
  PRICING: "Estimation de coût",
  MANUAL: "Contenu manuel",
  ANNEX: "Annexe",
};

/** Conservé pour les appelants existants — même table que `VERSION_STATUS_LABELS`. */
export const EXPORT_TEMPLATE_VERSION_STATUS_LABELS = VERSION_STATUS_LABELS;

export const EXPORT_JOB_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  GENERATING: "Génération en cours",
  COMPLETED: "Terminé",
  FAILED: "Échec",
};

export function exportJobStatusBadgeClass(status: string): string {
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

/**
 * Design System — ton de `Badge` par statut de version de template d'export (remplace l'ancien
 * `exportTemplateVersionStatusBadgeClass()`, qui recopiait à la main les classes de `Badge`).
 * Un statut inconnu n'a pas d'entrée : l'appelant retombe sur `"neutral"`, comme l'ancien `default`.
 */
export const EXPORT_TEMPLATE_VERSION_STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: "success",
  DRAFT: "warning",
  ARCHIVED: "neutral",
};

export type ExportCapabilityBlocker = { code: string };

export type ExportCapabilities = {
  canExport: boolean;
  canExportDocx: boolean;
  canExportPdf: boolean;
  canUseTemplate: boolean;
  blockers: ExportCapabilityBlocker[];
};

/** Mission — "si une donnée obligatoire manque : bouton désactivé, raison visible, message en
 *  français". Codes alignés sur `GetExportCapabilitiesUseCase` (backend), jamais un second
 *  vocabulaire divergent. */
export const EXPORT_CAPABILITY_BLOCKER_LABELS: Record<string, string> = {
  EXPORT_TEMPLATE_MISSING:
    "Aucun modèle d'export n'a encore été créé pour cette organisation. Un administrateur doit en créer un dans Configuration IA.",
  TEMPLATE_VERSION_MISSING:
    "Aucune version de modèle d'export n'est active. Un administrateur doit en activer une dans Configuration IA.",
};

const ORG_TIER = ["OWNER", "ORGANIZATION_ADMIN"];

/** Vérification UI uniquement — le backend revalide toujours via `ExportPermission.ManageExportTemplates`
 *  (`ROLE_EXPORT_PERMISSIONS`, OWNER/ORGANIZATION_ADMIN seulement), jamais une autorité côté frontend. */
export function canManageExportTemplates(role: string | undefined): boolean {
  return role !== undefined && ORG_TIER.includes(role);
}

/** Vérification UI uniquement — le backend revalide toujours via `AssertClientAccessUseCase` +
 *  `ClientPermission.ManageExport` (affectation client réelle nécessaire pour un rôle CONTRIBUTOR). */
export function canManageExport(role: string | undefined): boolean {
  return role !== undefined && role !== "READ_ONLY" && role !== "EXTERNAL_CONSULTANT";
}
