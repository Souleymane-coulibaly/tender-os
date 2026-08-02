import type { Deliverable } from "../domain/deliverable.aggregate";
import type { DeliverableComment } from "../domain/deliverable-comment.entity";
import type { DeliverableRevision } from "../domain/deliverable-revision.aggregate";
import type { DeliverableReview } from "../domain/deliverable-review.entity";
import type { DeliverableSection } from "../domain/deliverable-section.aggregate";
import type { DeliverableTemplate } from "../domain/deliverable-template.aggregate";
import type { DeliverableTemplateVersion } from "../domain/deliverable-template-version.entity";
import type { DocumentTheme } from "../domain/document-theme.aggregate";
import type { DocumentThemeVersion } from "../domain/document-theme-version.entity";

export type DeliverableSectionSummary = {
  id: string;
  deliverableId: string;
  code: string;
  title: string;
  order: number;
  headingLevel: 1 | 2 | 3;
  mandatory: boolean;
  hidden: boolean;
  locked: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export function toDeliverableSectionSummary(section: DeliverableSection): DeliverableSectionSummary {
  return {
    id: section.id,
    deliverableId: section.deliverableId,
    code: section.code,
    title: section.title,
    order: section.order,
    headingLevel: section.headingLevel,
    mandatory: section.mandatory,
    hidden: section.hidden,
    locked: section.locked,
    status: section.status,
    createdAt: section.createdAt.toISOString(),
    updatedAt: section.updatedAt.toISOString(),
  };
}

export type DeliverableSummary = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  type: string;
  status: string;
  templateVersionId?: string | undefined;
  templateSourceLevel?: string | undefined;
  themeVersionId?: string | undefined;
  themeSourceLevel?: string | undefined;
  themeSelectedBy?: string | undefined;
  themeSelectedAt?: string | undefined;
  approvedBy?: string | undefined;
  approvedAt?: string | undefined;
  costReportPricingEstimateId?: string | undefined;
  costReportPricingEstimateVersionNumber?: number | undefined;
  costReportSelectedBy?: string | undefined;
  costReportSelectedAt?: string | undefined;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sections?: readonly DeliverableSectionSummary[] | undefined;
};

export function toDeliverableSummary(deliverable: Deliverable, options?: { sections?: readonly DeliverableSection[] | undefined }): DeliverableSummary {
  return {
    id: deliverable.id,
    organizationId: deliverable.organizationId,
    clientAccountId: deliverable.clientAccountId,
    tenderId: deliverable.tenderId,
    type: deliverable.type,
    status: deliverable.status,
    templateVersionId: deliverable.templateVersionId,
    templateSourceLevel: deliverable.templateSourceLevel,
    themeVersionId: deliverable.themeVersionId,
    themeSourceLevel: deliverable.themeSourceLevel,
    themeSelectedBy: deliverable.themeSelectedBy,
    themeSelectedAt: deliverable.themeSelectedAt?.toISOString(),
    approvedBy: deliverable.approvedBy,
    approvedAt: deliverable.approvedAt?.toISOString(),
    costReportPricingEstimateId: deliverable.costReportPricingEstimateId,
    costReportPricingEstimateVersionNumber: deliverable.costReportPricingEstimateVersionNumber,
    costReportSelectedBy: deliverable.costReportSelectedBy,
    costReportSelectedAt: deliverable.costReportSelectedAt?.toISOString(),
    createdBy: deliverable.createdBy,
    createdAt: deliverable.createdAt.toISOString(),
    updatedAt: deliverable.updatedAt.toISOString(),
    sections: options?.sections?.map(toDeliverableSectionSummary),
  };
}

export type DeliverableTemplateVersionSummary = {
  id: string;
  deliverableTemplateId: string;
  version: number;
  status: string;
  sections: DeliverableTemplateVersion["sections"];
  createdBy: string;
  createdAt: string;
  activatedAt?: string | undefined;
  archivedAt?: string | undefined;
};

export type DeliverableTemplateSummary = {
  id: string;
  organizationId: string;
  scopeLevel: string;
  clientAccountId?: string | undefined;
  tenderId?: string | undefined;
  documentType: string;
  name: string;
  description?: string | undefined;
  note?: string | undefined;
  createdBy: string;
  createdAt: string;
  activeVersion?: DeliverableTemplateVersionSummary | undefined;
  versions?: readonly DeliverableTemplateVersionSummary[] | undefined;
};

export function toDeliverableTemplateVersionSummary(version: DeliverableTemplateVersion): DeliverableTemplateVersionSummary {
  return {
    id: version.id,
    deliverableTemplateId: version.deliverableTemplateId,
    version: version.version,
    status: version.status,
    sections: version.sections,
    createdBy: version.createdBy,
    createdAt: version.createdAt.toISOString(),
    activatedAt: version.activatedAt?.toISOString(),
    archivedAt: version.archivedAt?.toISOString(),
  };
}

export function toDeliverableTemplateSummary(
  template: DeliverableTemplate,
  options?: { activeVersion?: DeliverableTemplateVersion | undefined; versions?: readonly DeliverableTemplateVersion[] | undefined },
): DeliverableTemplateSummary {
  return {
    id: template.id,
    organizationId: template.organizationId,
    scopeLevel: template.scopeLevel,
    clientAccountId: template.clientAccountId,
    tenderId: template.tenderId,
    documentType: template.documentType,
    name: template.name,
    description: template.description,
    note: template.note,
    createdBy: template.createdBy,
    createdAt: template.createdAt.toISOString(),
    activeVersion: options?.activeVersion ? toDeliverableTemplateVersionSummary(options.activeVersion) : undefined,
    versions: options?.versions?.map(toDeliverableTemplateVersionSummary),
  };
}

export type DeliverableRevisionSummary = {
  id: string;
  deliverableSectionId: string;
  revisionNumber: number;
  previousRevisionId?: string | undefined;
  sourceType: string;
  sourceGenerationId?: string | undefined;
  sourceGenerationVersionNumber?: number | undefined;
  aiTaskType?: string | undefined;
  aiPromptVersionId?: string | undefined;
  aiModelProvider?: string | undefined;
  aiModelName?: string | undefined;
  aiRoutingDecisionId?: string | undefined;
  aiContextFingerprint?: string | undefined;
  aiGeneratedAt?: string | undefined;
  contentStructured: DeliverableRevision["contentStructured"];
  contentText: string;
  characterCount: number;
  status: string;
  editVersion: number;
  createdBy: string;
  createdByRole: string;
  createdAt: string;
  updatedAt: string;
  changeNote?: string | undefined;
};

export function toDeliverableRevisionSummary(revision: DeliverableRevision): DeliverableRevisionSummary {
  return {
    id: revision.id,
    deliverableSectionId: revision.deliverableSectionId,
    revisionNumber: revision.revisionNumber,
    previousRevisionId: revision.previousRevisionId,
    sourceType: revision.sourceType,
    sourceGenerationId: revision.sourceGenerationId,
    sourceGenerationVersionNumber: revision.sourceGenerationVersionNumber,
    aiTaskType: revision.aiTaskType,
    aiPromptVersionId: revision.aiPromptVersionId,
    aiModelProvider: revision.aiModelProvider,
    aiModelName: revision.aiModelName,
    aiRoutingDecisionId: revision.aiRoutingDecisionId,
    aiContextFingerprint: revision.aiContextFingerprint,
    aiGeneratedAt: revision.aiGeneratedAt?.toISOString(),
    contentStructured: revision.contentStructured,
    contentText: revision.contentText,
    characterCount: revision.characterCount,
    status: revision.status,
    editVersion: revision.editVersion,
    createdBy: revision.createdBy,
    createdByRole: revision.createdByRole,
    createdAt: revision.createdAt.toISOString(),
    updatedAt: revision.updatedAt.toISOString(),
    changeNote: revision.changeNote,
  };
}

export type DeliverableReviewSummary = {
  id: string;
  deliverableRevisionId: string;
  decision: string;
  comment?: string | undefined;
  decidedBy: string;
  decidedByRole: string;
  decidedAt: string;
};

export function toDeliverableReviewSummary(review: DeliverableReview): DeliverableReviewSummary {
  return {
    id: review.id,
    deliverableRevisionId: review.deliverableRevisionId,
    decision: review.decision,
    comment: review.comment,
    decidedBy: review.decidedBy,
    decidedByRole: review.decidedByRole,
    decidedAt: review.decidedAt.toISOString(),
  };
}

export type DeliverableCommentSummary = {
  id: string;
  deliverableId: string;
  deliverableSectionId?: string | undefined;
  deliverableRevisionId?: string | undefined;
  content: string;
  authorId: string;
  createdAt: string;
  status: string;
  resolvedBy?: string | undefined;
  resolvedAt?: string | undefined;
};

export function toDeliverableCommentSummary(comment: DeliverableComment): DeliverableCommentSummary {
  return {
    id: comment.id,
    deliverableId: comment.deliverableId,
    deliverableSectionId: comment.deliverableSectionId,
    deliverableRevisionId: comment.deliverableRevisionId,
    content: comment.content,
    authorId: comment.authorId,
    createdAt: comment.createdAt.toISOString(),
    status: comment.status,
    resolvedBy: comment.resolvedBy,
    resolvedAt: comment.resolvedAt?.toISOString(),
  };
}

export type DocumentThemeVersionSummary = {
  id: string;
  documentThemeId: string;
  version: number;
  status: string;
  logoStorageKey?: string | undefined;
  accentColor?: string | undefined;
  fontFamily?: string | undefined;
  config: DocumentThemeVersion["config"];
  createdBy: string;
  createdAt: string;
  activatedAt?: string | undefined;
  archivedAt?: string | undefined;
};

export type DocumentThemeSummary = {
  id: string;
  organizationId: string;
  scopeLevel: string;
  clientAccountId?: string | undefined;
  tenderId?: string | undefined;
  name: string;
  createdBy: string;
  createdAt: string;
  activeVersion?: DocumentThemeVersionSummary | undefined;
  versions?: readonly DocumentThemeVersionSummary[] | undefined;
};

export function toDocumentThemeVersionSummary(version: DocumentThemeVersion): DocumentThemeVersionSummary {
  return {
    id: version.id,
    documentThemeId: version.documentThemeId,
    version: version.version,
    status: version.status,
    logoStorageKey: version.logoStorageKey,
    accentColor: version.accentColor,
    fontFamily: version.fontFamily,
    config: version.config,
    createdBy: version.createdBy,
    createdAt: version.createdAt.toISOString(),
    activatedAt: version.activatedAt?.toISOString(),
    archivedAt: version.archivedAt?.toISOString(),
  };
}

export function toDocumentThemeSummary(
  theme: DocumentTheme,
  options?: { activeVersion?: DocumentThemeVersion | undefined; versions?: readonly DocumentThemeVersion[] | undefined },
): DocumentThemeSummary {
  return {
    id: theme.id,
    organizationId: theme.organizationId,
    scopeLevel: theme.scopeLevel,
    clientAccountId: theme.clientAccountId,
    tenderId: theme.tenderId,
    name: theme.name,
    createdBy: theme.createdBy,
    createdAt: theme.createdAt.toISOString(),
    activeVersion: options?.activeVersion ? toDocumentThemeVersionSummary(options.activeVersion) : undefined,
    versions: options?.versions?.map(toDocumentThemeVersionSummary),
  };
}
