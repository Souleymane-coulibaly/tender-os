import type { Prisma } from "@prisma/client";
import type { DeliverableTemplateSectionConfig } from "../domain/deliverable-template-section-config";
import { DeliverableTemplate } from "../domain/deliverable-template.aggregate";
import { DeliverableTemplateVersion } from "../domain/deliverable-template-version.entity";
import type { DeliverableType } from "../domain/deliverable-type";
import type { ScopeLevel } from "../domain/scope-level";
import type { TemplateSectionRequirement } from "../domain/template-section-requirement";
import type { VersionLifecycleStatus } from "../domain/version-lifecycle-status";

export type PersistedDeliverableTemplate = {
  id: string;
  organizationId: string;
  scopeLevel: string;
  clientAccountId: string | null;
  tenderId: string | null;
  documentType: string;
  name: string;
  description: string | null;
  note: string | null;
  createdBy: string;
  createdAt: Date;
};

export type PersistedDeliverableTemplateSection = {
  code: string;
  title: string;
  description: string | null;
  order: number;
  headingLevel: number;
  requirement: string;
  displayCondition: string | null;
  recommendedLength: number | null;
  maxCharacters: number | null;
  maxPages: number | null;
  instructions: string | null;
  styleHint: string | null;
  taskType: string | null;
  allowedVariables: unknown;
  validationRequired: boolean;
  pageBreakBefore: boolean;
};

export type PersistedDeliverableTemplateVersion = {
  id: string;
  organizationId: string;
  deliverableTemplateId: string;
  version: number;
  status: string;
  createdBy: string;
  createdAt: Date;
  activatedAt: Date | null;
  archivedAt: Date | null;
  sections: readonly PersistedDeliverableTemplateSection[];
};

export function toDomainTemplate(record: PersistedDeliverableTemplate): DeliverableTemplate {
  return DeliverableTemplate.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    scopeLevel: record.scopeLevel as ScopeLevel,
    clientAccountId: record.clientAccountId ?? undefined,
    tenderId: record.tenderId ?? undefined,
    documentType: record.documentType as DeliverableType,
    name: record.name,
    description: record.description ?? undefined,
    note: record.note ?? undefined,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
  });
}

export function toTemplateRow(template: DeliverableTemplate) {
  return {
    id: template.id,
    organizationId: template.organizationId,
    scopeLevel: template.scopeLevel,
    clientAccountId: template.clientAccountId ?? null,
    tenderId: template.tenderId ?? null,
    documentType: template.documentType,
    name: template.name,
    description: template.description ?? null,
    note: template.note ?? null,
    createdBy: template.createdBy,
    createdAt: template.createdAt,
  };
}

function toDomainSectionConfig(record: PersistedDeliverableTemplateSection): DeliverableTemplateSectionConfig {
  return {
    code: record.code,
    title: record.title,
    description: record.description ?? undefined,
    order: record.order,
    headingLevel: record.headingLevel as 1 | 2 | 3,
    requirement: record.requirement as TemplateSectionRequirement,
    displayCondition: record.displayCondition ?? undefined,
    recommendedLength: record.recommendedLength ?? undefined,
    maxCharacters: record.maxCharacters ?? undefined,
    maxPages: record.maxPages ?? undefined,
    instructions: record.instructions ?? undefined,
    styleHint: record.styleHint ?? undefined,
    taskType: record.taskType ?? undefined,
    allowedVariables: (record.allowedVariables as string[] | null) ?? [],
    validationRequired: record.validationRequired,
    pageBreakBefore: record.pageBreakBefore,
  };
}

export function toDomainTemplateVersion(record: PersistedDeliverableTemplateVersion): DeliverableTemplateVersion {
  return DeliverableTemplateVersion.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    deliverableTemplateId: record.deliverableTemplateId,
    version: record.version,
    status: record.status as VersionLifecycleStatus,
    sections: record.sections.map(toDomainSectionConfig),
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    activatedAt: record.activatedAt ?? undefined,
    archivedAt: record.archivedAt ?? undefined,
  });
}

export function toVersionRow(version: DeliverableTemplateVersion) {
  return {
    id: version.id,
    organizationId: version.organizationId,
    deliverableTemplateId: version.deliverableTemplateId,
    version: version.version,
    status: version.status,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
    activatedAt: version.activatedAt ?? null,
    archivedAt: version.archivedAt ?? null,
  };
}

export function toSectionRows(version: DeliverableTemplateVersion, idGenerator: { generate(): string }, organizationId: string) {
  return version.sections.map((section) => ({
    id: idGenerator.generate(),
    organizationId,
    deliverableTemplateVersionId: version.id,
    code: section.code,
    title: section.title,
    description: section.description ?? null,
    order: section.order,
    headingLevel: section.headingLevel,
    requirement: section.requirement,
    displayCondition: section.displayCondition ?? null,
    recommendedLength: section.recommendedLength ?? null,
    maxCharacters: section.maxCharacters ?? null,
    maxPages: section.maxPages ?? null,
    instructions: section.instructions ?? null,
    styleHint: section.styleHint ?? null,
    taskType: section.taskType ?? null,
    allowedVariables: section.allowedVariables as unknown as Prisma.InputJsonValue,
    validationRequired: section.validationRequired,
    pageBreakBefore: section.pageBreakBefore,
  }));
}
