import { AdministrativeDocument } from "../domain/administrative-document.aggregate";
import type { AdministrativeDocumentType } from "../domain/administrative-document-type";
import type { AdministrativeSignatureMode, AdministrativeSignatureStatus } from "../domain/administrative-signature";

export type PersistedAdministrativeDocument = {
  id: string;
  organizationId: string;
  administrativeDossierId: string;
  tenderId: string;
  documentType: string;
  label: string;
  requirementId: string | null;
  validatedRevisionId: string | null;
  validatedAt: Date | null;
  validatedBy: string | null;
  signatureMode: string;
  signatureStatus: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainAdministrativeDocument(record: PersistedAdministrativeDocument): AdministrativeDocument {
  return AdministrativeDocument.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    administrativeDossierId: record.administrativeDossierId,
    tenderId: record.tenderId,
    documentType: record.documentType as AdministrativeDocumentType,
    label: record.label,
    requirementId: record.requirementId ?? undefined,
    validatedRevisionId: record.validatedRevisionId ?? undefined,
    validatedAt: record.validatedAt ?? undefined,
    validatedBy: record.validatedBy ?? undefined,
    signatureMode: record.signatureMode as AdministrativeSignatureMode,
    signatureStatus: record.signatureStatus as AdministrativeSignatureStatus,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toAdministrativeDocumentRow(document: AdministrativeDocument) {
  return {
    id: document.id,
    organizationId: document.organizationId,
    administrativeDossierId: document.administrativeDossierId,
    tenderId: document.tenderId,
    documentType: document.documentType,
    label: document.label,
    requirementId: document.requirementId ?? null,
    validatedRevisionId: document.validatedRevisionId ?? null,
    validatedAt: document.validatedAt ?? null,
    validatedBy: document.validatedBy ?? null,
    signatureMode: document.signatureMode,
    signatureStatus: document.signatureStatus,
    createdBy: document.createdBy,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}
