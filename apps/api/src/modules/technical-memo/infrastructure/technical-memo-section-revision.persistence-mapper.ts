import type { Prisma } from "@prisma/client";
import type { TechnicalMemoSectionRevisionSource } from "../domain/enums";
import { TechnicalMemoSectionRevision } from "../domain/technical-memo-section-revision.entity";
import type { TechnicalMemoSectionCitation } from "../domain/technical-memo-section-citation.value-object";
import { toDomainTechnicalMemoSectionCitation } from "./technical-memo-section-citation.persistence-mapper";

type TechnicalMemoSectionRevisionRow = {
  id: string;
  organizationId: string;
  technicalMemoSectionId: string;
  revisionNumber: number;
  source: string;
  content: string;
  userInstruction: string | null;
  aiModel: string | null;
  promptVersion: number | null;
  inputTokenCount: number | null;
  outputTokenCount: number | null;
  totalTokenCount: number | null;
  missingDataNotes: Prisma.JsonValue;
  candidateCompanyId: string | null;
  analysisVersion: number | null;
  dceRevision: number | null;
  createdBy: string;
  createdAt: Date;
  citations?: Parameters<typeof toDomainTechnicalMemoSectionCitation>[0][];
};

export function toDomainTechnicalMemoSectionRevision(record: TechnicalMemoSectionRevisionRow): TechnicalMemoSectionRevision {
  return TechnicalMemoSectionRevision.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    technicalMemoSectionId: record.technicalMemoSectionId,
    revisionNumber: record.revisionNumber,
    source: record.source as TechnicalMemoSectionRevisionSource,
    content: record.content,
    userInstruction: record.userInstruction ?? undefined,
    aiModel: record.aiModel ?? undefined,
    promptVersion: record.promptVersion ?? undefined,
    inputTokenCount: record.inputTokenCount ?? undefined,
    outputTokenCount: record.outputTokenCount ?? undefined,
    totalTokenCount: record.totalTokenCount ?? undefined,
    missingDataNotes: (record.missingDataNotes as unknown as string[]) ?? [],
    citations: (record.citations ?? []).map(toDomainTechnicalMemoSectionCitation),
    candidateCompanyId: record.candidateCompanyId ?? undefined,
    analysisVersion: record.analysisVersion ?? undefined,
    dceRevision: record.dceRevision ?? undefined,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
  });
}

export function toTechnicalMemoSectionRevisionRow(revision: TechnicalMemoSectionRevision) {
  return {
    id: revision.id,
    organizationId: revision.organizationId,
    technicalMemoSectionId: revision.technicalMemoSectionId,
    revisionNumber: revision.revisionNumber,
    source: revision.source,
    content: revision.content,
    userInstruction: revision.userInstruction ?? null,
    aiModel: revision.aiModel ?? null,
    promptVersion: revision.promptVersion ?? null,
    inputTokenCount: revision.inputTokenCount ?? null,
    outputTokenCount: revision.outputTokenCount ?? null,
    totalTokenCount: revision.totalTokenCount ?? null,
    missingDataNotes: revision.missingDataNotes as unknown as Prisma.InputJsonValue,
    candidateCompanyId: revision.candidateCompanyId ?? null,
    analysisVersion: revision.analysisVersion ?? null,
    dceRevision: revision.dceRevision ?? null,
    createdBy: revision.createdBy,
    createdAt: revision.createdAt,
  };
}

export type { TechnicalMemoSectionCitation };
