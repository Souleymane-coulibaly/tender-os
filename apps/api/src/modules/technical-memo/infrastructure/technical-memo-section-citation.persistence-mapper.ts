import type { TechnicalMemoCitationSourceType, TechnicalMemoRequirementFindingType } from "../domain/enums";
import { TechnicalMemoSectionCitation } from "../domain/technical-memo-section-citation.value-object";

type TechnicalMemoSectionCitationRow = {
  id: string;
  organizationId: string;
  technicalMemoSectionRevisionId: string;
  sourceType: string;
  findingType: string | null;
  findingId: string | null;
  knowledgeEntryId: string | null;
  knowledgeEntryVersionId: string | null;
  companyReferenceId: string | null;
  candidateFieldPath: string | null;
  documentId: string | null;
  chunkSequence: number | null;
  pageStart: number | null;
  pageEnd: number | null;
  label: string;
  excerpt: string | null;
  createdAt: Date;
};

export function toDomainTechnicalMemoSectionCitation(record: TechnicalMemoSectionCitationRow): TechnicalMemoSectionCitation {
  return TechnicalMemoSectionCitation.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    technicalMemoSectionRevisionId: record.technicalMemoSectionRevisionId,
    sourceType: record.sourceType as TechnicalMemoCitationSourceType,
    findingType: (record.findingType as TechnicalMemoRequirementFindingType | null) ?? undefined,
    findingId: record.findingId ?? undefined,
    knowledgeEntryId: record.knowledgeEntryId ?? undefined,
    knowledgeEntryVersionId: record.knowledgeEntryVersionId ?? undefined,
    companyReferenceId: record.companyReferenceId ?? undefined,
    candidateFieldPath: record.candidateFieldPath ?? undefined,
    documentId: record.documentId ?? undefined,
    chunkSequence: record.chunkSequence ?? undefined,
    pageStart: record.pageStart ?? undefined,
    pageEnd: record.pageEnd ?? undefined,
    label: record.label,
    excerpt: record.excerpt ?? undefined,
    createdAt: record.createdAt,
  });
}

export function toTechnicalMemoSectionCitationRow(citation: TechnicalMemoSectionCitation) {
  return {
    id: citation.id,
    organizationId: citation.organizationId,
    technicalMemoSectionRevisionId: citation.technicalMemoSectionRevisionId,
    sourceType: citation.sourceType,
    findingType: citation.findingType ?? null,
    findingId: citation.findingId ?? null,
    knowledgeEntryId: citation.knowledgeEntryId ?? null,
    knowledgeEntryVersionId: citation.knowledgeEntryVersionId ?? null,
    companyReferenceId: citation.companyReferenceId ?? null,
    candidateFieldPath: citation.candidateFieldPath ?? null,
    documentId: citation.documentId ?? null,
    chunkSequence: citation.chunkSequence ?? null,
    pageStart: citation.pageStart ?? null,
    pageEnd: citation.pageEnd ?? null,
    label: citation.label,
    excerpt: citation.excerpt ?? null,
    createdAt: citation.createdAt,
  };
}
