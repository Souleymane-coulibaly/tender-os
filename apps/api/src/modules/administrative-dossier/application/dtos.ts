import type { AdministrativeChecklistLine } from "../domain/administrative-checklist";
import type { AdministrativeDocument } from "../domain/administrative-document.aggregate";
import type { AdministrativeDocumentRevision } from "../domain/administrative-document-revision.entity";
import type { AdministrativeDossier } from "../domain/administrative-dossier.aggregate";
import type { AdministrativeRequirement } from "../domain/administrative-requirement.aggregate";

export type AdministrativeDossierSummary = {
  id: string;
  tenderId: string;
  status: string;
  completionPercentage: number;
  validationStatus: string;
  lastValidatedAt?: string | undefined;
  lastValidatedBy?: string | undefined;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export function toAdministrativeDossierSummary(
  dossier: AdministrativeDossier,
): AdministrativeDossierSummary {
  return {
    id: dossier.id,
    tenderId: dossier.tenderId,
    status: dossier.status,
    completionPercentage: dossier.completionPercentage,
    validationStatus: dossier.validationStatus,
    lastValidatedAt: dossier.lastValidatedAt?.toISOString(),
    lastValidatedBy: dossier.lastValidatedBy,
    version: dossier.version,
    createdAt: dossier.createdAt.toISOString(),
    updatedAt: dossier.updatedAt.toISOString(),
  };
}

export type AdministrativeRequirementSummary = {
  id: string;
  tenderId: string;
  sourceDocumentId?: string | undefined;
  sourceDocumentVersion?: number | undefined;
  sourceLocation?: string | undefined;
  title: string;
  description?: string | undefined;
  requirementType: string;
  expectedDocumentType: string;
  required: boolean;
  applicable: boolean;
  dueDate?: string | undefined;
  validityRule?: string | undefined;
  signatureRequired: boolean;
  originalTextReference?: string | undefined;
  confidence?: number | undefined;
  origin: string;
  createdBy: string;
  validatedBy?: string | undefined;
  validationStatus: string;
  matchedDocumentId?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export function toAdministrativeRequirementSummary(
  requirement: AdministrativeRequirement,
): AdministrativeRequirementSummary {
  return {
    id: requirement.id,
    tenderId: requirement.tenderId,
    sourceDocumentId: requirement.sourceDocumentId,
    sourceDocumentVersion: requirement.sourceDocumentVersion,
    sourceLocation: requirement.sourceLocation,
    title: requirement.title,
    description: requirement.description,
    requirementType: requirement.requirementType,
    expectedDocumentType: requirement.expectedDocumentType,
    required: requirement.required,
    applicable: requirement.applicable,
    dueDate: requirement.dueDate?.toISOString(),
    validityRule: requirement.validityRule,
    signatureRequired: requirement.signatureRequired,
    originalTextReference: requirement.originalTextReference,
    confidence: requirement.confidence,
    origin: requirement.origin,
    createdBy: requirement.createdBy,
    validatedBy: requirement.validatedBy,
    validationStatus: requirement.validationStatus,
    matchedDocumentId: requirement.matchedDocumentId,
    createdAt: requirement.createdAt.toISOString(),
    updatedAt: requirement.updatedAt.toISOString(),
  };
}

export type AdministrativeDocumentRevisionSummary = {
  id: string;
  administrativeDocumentId: string;
  revisionNumber: number;
  documentId?: string | undefined;
  documentVersionId?: string | undefined;
  documentChecksum?: string | undefined;
  documentFileName?: string | undefined;
  documentMimeType?: string | undefined;
  expiresAt?: string | undefined;
  status: string;
  /** Sprint 8C.1 — présent uniquement si cette révision est une Annexe TenderOS générée pour un
   *  formulaire officiel (jamais pour un fichier déposé manuellement). */
  officialTemplateId?: string | undefined;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export function toAdministrativeDocumentRevisionSummary(
  revision: AdministrativeDocumentRevision,
): AdministrativeDocumentRevisionSummary {
  return {
    id: revision.id,
    administrativeDocumentId: revision.administrativeDocumentId,
    revisionNumber: revision.revisionNumber,
    documentId: revision.documentId,
    documentVersionId: revision.documentVersionId,
    documentChecksum: revision.documentChecksum,
    documentFileName: revision.documentFileName,
    documentMimeType: revision.documentMimeType,
    expiresAt: revision.expiresAt?.toISOString(),
    status: revision.status,
    officialTemplateId: revision.officialTemplateId,
    createdBy: revision.createdBy,
    createdAt: revision.createdAt.toISOString(),
    updatedAt: revision.updatedAt.toISOString(),
  };
}

export type AdministrativeDocumentSummary = {
  id: string;
  administrativeDossierId: string;
  tenderId: string;
  documentType: string;
  label: string;
  requirementId?: string | undefined;
  validatedRevisionId?: string | undefined;
  validatedAt?: string | undefined;
  validatedBy?: string | undefined;
  signatureMode: string;
  signatureStatus: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  revisions: readonly AdministrativeDocumentRevisionSummary[];
};

export function toAdministrativeDocumentSummary(
  document: AdministrativeDocument,
  revisions: readonly AdministrativeDocumentRevision[],
): AdministrativeDocumentSummary {
  return {
    id: document.id,
    administrativeDossierId: document.administrativeDossierId,
    tenderId: document.tenderId,
    documentType: document.documentType,
    label: document.label,
    requirementId: document.requirementId,
    validatedRevisionId: document.validatedRevisionId,
    validatedAt: document.validatedAt?.toISOString(),
    validatedBy: document.validatedBy,
    signatureMode: document.signatureMode,
    signatureStatus: document.signatureStatus,
    createdBy: document.createdBy,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    revisions: revisions.map(toAdministrativeDocumentRevisionSummary),
  };
}

export type AdministrativeChecklistLineDto = AdministrativeChecklistLine;

export type AdministrativeChecklistDto = {
  lines: readonly AdministrativeChecklistLineDto[];
  completionPercentage: number;
};

export type AdministrativeDossierCapabilities = {
  canView: boolean;
  canEdit: boolean;
  canValidate: boolean;
  canGenerateDc1: boolean;
  canGenerateDc2: boolean;
  canGenerateDc4: boolean;
  canGenerateDume: boolean;
  canGenerateEngagementAct: boolean;
  signatureSummary: { required: number; pending: number; signed: number };
  blockers: readonly string[];
  warnings: readonly string[];
};

/**
 * Élément léger d'une liste de documents administratifs — source d'un sélecteur. Sans les
 * révisions : les charger coûterait une requête par document, et renvoyer une liste vide à la place
 * serait faux.
 */
export type AdministrativeDocumentListItem = Readonly<{
  id: string;
  label: string;
  documentType: string;
  validatedRevisionId?: string;
  signatureStatus: string;
}>;

export function toAdministrativeDocumentListItem(
  document: AdministrativeDocument,
): AdministrativeDocumentListItem {
  return {
    id: document.id,
    label: document.label,
    documentType: document.documentType,
    ...(document.validatedRevisionId ? { validatedRevisionId: document.validatedRevisionId } : {}),
    signatureStatus: document.signatureStatus,
  };
}
