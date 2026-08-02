import type { Prisma } from "@prisma/client";
import type { RenderableBlock } from "../../export";
import { DeliverableRevision } from "../domain/deliverable-revision.aggregate";
import type { DeliverableRevisionSourceType } from "../domain/deliverable-revision-source-type";
import type { DeliverableRevisionStatus } from "../domain/deliverable-revision-status";

export type PersistedDeliverableRevision = {
  id: string;
  organizationId: string;
  deliverableSectionId: string;
  revisionNumber: number;
  previousRevisionId: string | null;
  sourceType: string;
  sourceGenerationId: string | null;
  sourceGenerationVersionNumber: number | null;
  aiTaskType: string | null;
  aiPromptVersionId: string | null;
  aiModelProvider: string | null;
  aiModelName: string | null;
  aiRoutingDecisionId: string | null;
  aiContextFingerprint: string | null;
  aiGeneratedAt: Date | null;
  contentStructured: unknown;
  contentText: string;
  characterCount: number;
  status: string;
  editVersion: number;
  createdBy: string;
  createdByRole: string;
  createdAt: Date;
  updatedAt: Date;
  changeNote: string | null;
};

export function toDomainRevision(record: PersistedDeliverableRevision): DeliverableRevision {
  return DeliverableRevision.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    deliverableSectionId: record.deliverableSectionId,
    revisionNumber: record.revisionNumber,
    previousRevisionId: record.previousRevisionId ?? undefined,
    sourceType: record.sourceType as DeliverableRevisionSourceType,
    sourceGenerationId: record.sourceGenerationId ?? undefined,
    sourceGenerationVersionNumber: record.sourceGenerationVersionNumber ?? undefined,
    aiTaskType: record.aiTaskType ?? undefined,
    aiPromptVersionId: record.aiPromptVersionId ?? undefined,
    aiModelProvider: record.aiModelProvider ?? undefined,
    aiModelName: record.aiModelName ?? undefined,
    aiRoutingDecisionId: record.aiRoutingDecisionId ?? undefined,
    aiContextFingerprint: record.aiContextFingerprint ?? undefined,
    aiGeneratedAt: record.aiGeneratedAt ?? undefined,
    contentStructured: record.contentStructured as readonly RenderableBlock[],
    contentText: record.contentText,
    characterCount: record.characterCount,
    status: record.status as DeliverableRevisionStatus,
    editVersion: record.editVersion,
    createdBy: record.createdBy,
    createdByRole: record.createdByRole,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    changeNote: record.changeNote ?? undefined,
  });
}

export function toRevisionRow(revision: DeliverableRevision) {
  return {
    id: revision.id,
    organizationId: revision.organizationId,
    deliverableSectionId: revision.deliverableSectionId,
    revisionNumber: revision.revisionNumber,
    previousRevisionId: revision.previousRevisionId ?? null,
    sourceType: revision.sourceType,
    sourceGenerationId: revision.sourceGenerationId ?? null,
    sourceGenerationVersionNumber: revision.sourceGenerationVersionNumber ?? null,
    aiTaskType: revision.aiTaskType ?? null,
    aiPromptVersionId: revision.aiPromptVersionId ?? null,
    aiModelProvider: revision.aiModelProvider ?? null,
    aiModelName: revision.aiModelName ?? null,
    aiRoutingDecisionId: revision.aiRoutingDecisionId ?? null,
    aiContextFingerprint: revision.aiContextFingerprint ?? null,
    aiGeneratedAt: revision.aiGeneratedAt ?? null,
    contentStructured: revision.contentStructured as unknown as Prisma.InputJsonValue,
    contentText: revision.contentText,
    characterCount: revision.characterCount,
    status: revision.status,
    editVersion: revision.editVersion,
    createdBy: revision.createdBy,
    createdByRole: revision.createdByRole,
    createdAt: revision.createdAt,
    updatedAt: revision.updatedAt,
    changeNote: revision.changeNote ?? null,
  };
}
