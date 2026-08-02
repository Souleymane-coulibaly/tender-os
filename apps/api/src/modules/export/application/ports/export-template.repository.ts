import type { ExportTemplate } from "../../domain/export-template.aggregate";
import type { ExportTemplateVersion } from "../../domain/export-template-version.entity";

export type ExportTemplateWithVersions = { template: ExportTemplate; activeVersion?: ExportTemplateVersion | undefined };

export interface ExportTemplateRepository {
  createWithFirstVersion(input: { template: ExportTemplate; version: ExportTemplateVersion }): Promise<void>;
  findById(input: { organizationId: string; exportTemplateId: string }): Promise<ExportTemplateWithVersions | null>;
  findByDocumentTypeAndName(input: { organizationId: string; documentType: string; name: string }): Promise<ExportTemplate | null>;
  list(input: { organizationId: string }): Promise<readonly ExportTemplateWithVersions[]>;

  createVersion(version: ExportTemplateVersion): Promise<void>;
  findVersionById(input: { organizationId: string; versionId: string }): Promise<ExportTemplateVersion | null>;
  findActiveVersion(input: { organizationId: string; exportTemplateId: string }): Promise<ExportTemplateVersion | null>;
  listVersions(input: { organizationId: string; exportTemplateId: string }): Promise<readonly ExportTemplateVersion[]>;

  /** Mission Sprint 8A §7/§16 — activation atomique : archive l'éventuelle version ACTIVE puis
   *  active la nouvelle, dans la MÊME transaction courte (même motif que
   *  `PrismaPromptVersionRepository.activateAtomically`, Sprint 6). */
  activateAtomically(input: { organizationId: string; exportTemplateId: string; versionId: string; occurredAt: Date }): Promise<ExportTemplateVersion>;
}

export const EXPORT_TEMPLATE_REPOSITORY = Symbol("EXPORT_TEMPLATE_REPOSITORY");
