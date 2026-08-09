import type { DocumentTemplateFieldMapping } from "../../domain/document-template-field-mapping";
import type { DocumentTemplateVersion } from "../../domain/document-template-version.entity";
import type { DocumentTemplate } from "../../domain/document-template.aggregate";

export type DocumentTemplateWithActiveVersion = { template: DocumentTemplate; activeVersion?: DocumentTemplateVersion | undefined };

export interface DocumentTemplateRepository {
  create(template: DocumentTemplate): Promise<void>;
  findById(input: { organizationId: string; documentTemplateId: string }): Promise<DocumentTemplateWithActiveVersion | null>;
  findByName(input: { organizationId: string; name: string }): Promise<DocumentTemplate | null>;
  list(input: { organizationId: string }): Promise<readonly DocumentTemplateWithActiveVersion[]>;

  createVersion(input: { version: DocumentTemplateVersion; fieldMappings: readonly DocumentTemplateFieldMapping[] }): Promise<void>;
  findVersionById(input: { organizationId: string; versionId: string }): Promise<DocumentTemplateVersion | null>;
  findActiveVersion(input: { organizationId: string; documentTemplateId: string }): Promise<DocumentTemplateVersion | null>;
  listVersions(input: { organizationId: string; documentTemplateId: string }): Promise<readonly DocumentTemplateVersion[]>;
  nextVersionNumber(input: { organizationId: string; documentTemplateId: string }): Promise<number>;

  /** Archive l'éventuelle version ACTIVE puis active la nouvelle, transaction courte — même motif
   *  qu'`ExportTemplateRepository.activateAtomically`. L'index partiel
   *  `document_template_versions_org_template_active_key` (migration) reste le filet de sécurité de
   *  dernier recours contre une course concurrente. */
  activateAtomically(input: { organizationId: string; documentTemplateId: string; versionId: string; occurredAt: Date }): Promise<DocumentTemplateVersion>;
}

export const DOCUMENT_TEMPLATE_REPOSITORY = Symbol("DOCUMENT_TEMPLATE_REPOSITORY");
