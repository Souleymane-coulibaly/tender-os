import { OfficialAdministrativeTemplate } from "../domain/official-administrative-template.aggregate";
import type { AdministrativeFormType } from "../domain/administrative-form-type";

export type PersistedOfficialAdministrativeTemplate = {
  id: string;
  organizationId: string | null;
  documentType: string;
  officialName: string;
  version: number;
  sourceAuthority: string;
  sourceReference: string;
  publishedAt: Date | null;
  importedAt: Date;
  fileDocumentId: string;
  fileDocumentVersionId: string;
  hash: string;
  active: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainOfficialAdministrativeTemplate(record: PersistedOfficialAdministrativeTemplate): OfficialAdministrativeTemplate {
  return OfficialAdministrativeTemplate.rehydrate({
    id: record.id,
    organizationId: record.organizationId ?? undefined,
    documentType: record.documentType as AdministrativeFormType,
    officialName: record.officialName,
    version: record.version,
    sourceAuthority: record.sourceAuthority,
    sourceReference: record.sourceReference,
    publishedAt: record.publishedAt ?? undefined,
    importedAt: record.importedAt,
    fileDocumentId: record.fileDocumentId,
    fileDocumentVersionId: record.fileDocumentVersionId,
    hash: record.hash,
    active: record.active,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toOfficialAdministrativeTemplateRow(template: OfficialAdministrativeTemplate) {
  return {
    id: template.id,
    organizationId: template.organizationId ?? null,
    documentType: template.documentType,
    officialName: template.officialName,
    version: template.version,
    sourceAuthority: template.sourceAuthority,
    sourceReference: template.sourceReference,
    publishedAt: template.publishedAt ?? null,
    importedAt: template.importedAt,
    fileDocumentId: template.fileDocumentId,
    fileDocumentVersionId: template.fileDocumentVersionId,
    hash: template.hash,
    active: template.active,
    createdBy: template.createdBy,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}
