import type { DeliverableTemplate } from "../../domain/deliverable-template.aggregate";
import type { DeliverableTemplateVersion } from "../../domain/deliverable-template-version.entity";
import type { DeliverableType } from "../../domain/deliverable-type";
import type { ScopeLevel } from "../../domain/scope-level";

export type DeliverableTemplateWithVersions = { template: DeliverableTemplate; activeVersion?: DeliverableTemplateVersion | undefined };

export interface DeliverableTemplateRepository {
  createWithFirstVersion(input: { template: DeliverableTemplate; version: DeliverableTemplateVersion }): Promise<void>;
  findById(input: { organizationId: string; deliverableTemplateId: string }): Promise<DeliverableTemplateWithVersions | null>;
  list(input: { organizationId: string; documentType?: DeliverableType | undefined }): Promise<readonly DeliverableTemplateWithVersions[]>;

  createVersion(version: DeliverableTemplateVersion): Promise<void>;
  findVersionById(input: { organizationId: string; versionId: string }): Promise<DeliverableTemplateVersion | null>;
  listVersions(input: { organizationId: string; deliverableTemplateId: string }): Promise<readonly DeliverableTemplateVersion[]>;

  /** Mission §5 — activation atomique (archive l'éventuelle version ACTIVE puis active la
   *  nouvelle, dans la même transaction courte — même motif qu'Export/Sprint 6). */
  activateAtomically(input: { organizationId: string; deliverableTemplateId: string; versionId: string; occurredAt: Date }): Promise<DeliverableTemplateVersion>;

  /**
   * Mission §5 — résolution de hiérarchie : la version ACTIVE du template correspondant à ce
   * `scopeLevel` exact (TENDER→`tenderId`, CLIENT→`clientAccountId`, ORGANIZATION→aucun des deux),
   * pour ce `documentType`. Utilisé par le résolveur applicatif dans l'ordre TENDER > CLIENT >
   * ORGANIZATION — jamais une fusion, un seul niveau gagne (mission "aucune fusion silencieuse").
   */
  findActiveVersionForScope(input: {
    organizationId: string;
    scopeLevel: ScopeLevel;
    clientAccountId?: string | undefined;
    tenderId?: string | undefined;
    documentType: DeliverableType;
  }): Promise<{ template: DeliverableTemplate; version: DeliverableTemplateVersion } | null>;
}

export const DELIVERABLE_TEMPLATE_REPOSITORY = Symbol("DELIVERABLE_TEMPLATE_REPOSITORY");
