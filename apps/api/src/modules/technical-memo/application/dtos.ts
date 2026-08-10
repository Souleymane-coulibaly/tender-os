import type { TechnicalMemo } from "../domain/technical-memo.aggregate";
import type { TechnicalMemoSection } from "../domain/technical-memo-section.entity";
import type { TechnicalMemoSectionCitation } from "../domain/technical-memo-section-citation.value-object";
import type { TechnicalMemoSectionRequirement } from "../domain/technical-memo-section-requirement.entity";
import type { TechnicalMemoSectionRevision } from "../domain/technical-memo-section-revision.entity";

/**
 * Les agrégats/entités du domaine exposent leur état via des GETTERS de prototype (`get id()`,
 * etc.) — `JSON.stringify` (utilisé par Express/Nest pour sérialiser une réponse HTTP) ne sérialise
 * que les propriétés PROPRES énumérables d'un objet, jamais les accesseurs hérités du prototype.
 * Renvoyer un agrégat directement depuis un contrôleur produirait donc une réponse vide/incorrecte
 * (`{}` ou seulement le champ `props` interne) — même motif que `toTenderSummary`/`toMessageSummary`
 * partout ailleurs dans ce dépôt : chaque type retourné par une route HTTP passe par un mapper
 * explicite vers un objet litéral plat, jamais l'instance de classe elle-même.
 */

export type TechnicalMemoSummary = Readonly<{
  id: string;
  organizationId: string;
  tenderId: string;
  clientAccountId: string;
  lotId?: string | undefined;
  templateOrigin: string;
  originalDocumentId?: string | undefined;
  originalDocumentVersionId?: string | undefined;
  documentTemplateId?: string | undefined;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}>;

export function toTechnicalMemoSummary(memo: TechnicalMemo): TechnicalMemoSummary {
  return {
    id: memo.id,
    organizationId: memo.organizationId,
    tenderId: memo.tenderId,
    clientAccountId: memo.clientAccountId,
    lotId: memo.lotId,
    templateOrigin: memo.templateOrigin,
    originalDocumentId: memo.originalDocumentId,
    originalDocumentVersionId: memo.originalDocumentVersionId,
    documentTemplateId: memo.documentTemplateId,
    status: memo.status,
    createdBy: memo.createdBy,
    createdAt: memo.createdAt.toISOString(),
    updatedAt: memo.updatedAt.toISOString(),
  };
}

export type TechnicalMemoSectionSummary = Readonly<{
  id: string;
  organizationId: string;
  technicalMemoId: string;
  parentSectionId?: string | undefined;
  sectionKey: string;
  title: string;
  order: number;
  level: number;
  category: string;
  categoryConfirmedByUser: boolean;
  instructionText?: string | undefined;
  isTable: boolean;
  wordLimit?: number | undefined;
  pageLimit?: number | undefined;
  status: string;
  content?: string | undefined;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}>;

export function toTechnicalMemoSectionSummary(section: TechnicalMemoSection): TechnicalMemoSectionSummary {
  return {
    id: section.id,
    organizationId: section.organizationId,
    technicalMemoId: section.technicalMemoId,
    parentSectionId: section.parentSectionId,
    sectionKey: section.sectionKey,
    title: section.title,
    order: section.order,
    level: section.level,
    category: section.category,
    categoryConfirmedByUser: section.categoryConfirmedByUser,
    instructionText: section.instructionText,
    isTable: section.isTable,
    wordLimit: section.wordLimit,
    pageLimit: section.pageLimit,
    status: section.status,
    content: section.content,
    createdBy: section.createdBy,
    createdAt: section.createdAt.toISOString(),
    updatedAt: section.updatedAt.toISOString(),
  };
}

export type TechnicalMemoSectionCitationSummary = Readonly<{
  id: string;
  sourceType: string;
  findingType?: string | undefined;
  findingId?: string | undefined;
  knowledgeEntryId?: string | undefined;
  knowledgeEntryVersionId?: string | undefined;
  companyReferenceId?: string | undefined;
  candidateFieldPath?: string | undefined;
  documentId?: string | undefined;
  chunkSequence?: number | undefined;
  pageStart?: number | undefined;
  pageEnd?: number | undefined;
  label: string;
  excerpt?: string | undefined;
}>;

export function toTechnicalMemoSectionCitationSummary(citation: TechnicalMemoSectionCitation): TechnicalMemoSectionCitationSummary {
  return {
    id: citation.id,
    sourceType: citation.sourceType,
    findingType: citation.findingType,
    findingId: citation.findingId,
    knowledgeEntryId: citation.knowledgeEntryId,
    knowledgeEntryVersionId: citation.knowledgeEntryVersionId,
    companyReferenceId: citation.companyReferenceId,
    candidateFieldPath: citation.candidateFieldPath,
    documentId: citation.documentId,
    chunkSequence: citation.chunkSequence,
    pageStart: citation.pageStart,
    pageEnd: citation.pageEnd,
    label: citation.label,
    excerpt: citation.excerpt,
  };
}

export type TechnicalMemoSectionRevisionSummary = Readonly<{
  id: string;
  technicalMemoSectionId: string;
  revisionNumber: number;
  source: string;
  content: string;
  userInstruction?: string | undefined;
  aiModel?: string | undefined;
  promptVersion?: number | undefined;
  missingDataNotes: readonly string[];
  citations: readonly TechnicalMemoSectionCitationSummary[];
  createdBy: string;
  createdAt: string;
}>;

export function toTechnicalMemoSectionRevisionSummary(revision: TechnicalMemoSectionRevision): TechnicalMemoSectionRevisionSummary {
  return {
    id: revision.id,
    technicalMemoSectionId: revision.technicalMemoSectionId,
    revisionNumber: revision.revisionNumber,
    source: revision.source,
    content: revision.content,
    userInstruction: revision.userInstruction,
    aiModel: revision.aiModel,
    promptVersion: revision.promptVersion,
    missingDataNotes: revision.missingDataNotes,
    citations: revision.citations.map(toTechnicalMemoSectionCitationSummary),
    createdBy: revision.createdBy,
    createdAt: revision.createdAt.toISOString(),
  };
}

export type TechnicalMemoSectionRequirementSummary = Readonly<{
  id: string;
  technicalMemoSectionId: string;
  findingType: string;
  findingId: string;
  coverageStatus: string;
  coverageReason?: string | undefined;
  confirmedByUser: boolean;
}>;

export function toTechnicalMemoSectionRequirementSummary(link: TechnicalMemoSectionRequirement): TechnicalMemoSectionRequirementSummary {
  return {
    id: link.id,
    technicalMemoSectionId: link.technicalMemoSectionId,
    findingType: link.findingType,
    findingId: link.findingId,
    coverageStatus: link.coverageStatus,
    coverageReason: link.coverageReason,
    confirmedByUser: link.confirmedByUser,
  };
}
