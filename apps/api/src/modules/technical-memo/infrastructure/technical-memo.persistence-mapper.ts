import type { TechnicalMemoStatus, TechnicalMemoTemplateOrigin } from "../domain/enums";
import { TechnicalMemo } from "../domain/technical-memo.aggregate";

type TechnicalMemoRow = {
  id: string;
  organizationId: string;
  tenderId: string;
  clientAccountId: string;
  lotId: string | null;
  templateOrigin: string;
  originalDocumentId: string | null;
  originalDocumentVersionId: string | null;
  documentTemplateId: string | null;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainTechnicalMemo(record: TechnicalMemoRow): TechnicalMemo {
  return TechnicalMemo.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    clientAccountId: record.clientAccountId,
    lotId: record.lotId ?? undefined,
    templateOrigin: record.templateOrigin as TechnicalMemoTemplateOrigin,
    originalDocumentId: record.originalDocumentId ?? undefined,
    originalDocumentVersionId: record.originalDocumentVersionId ?? undefined,
    documentTemplateId: record.documentTemplateId ?? undefined,
    status: record.status as TechnicalMemoStatus,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toTechnicalMemoRow(memo: TechnicalMemo) {
  return {
    id: memo.id,
    organizationId: memo.organizationId,
    tenderId: memo.tenderId,
    clientAccountId: memo.clientAccountId,
    lotId: memo.lotId ?? null,
    templateOrigin: memo.templateOrigin,
    originalDocumentId: memo.originalDocumentId ?? null,
    originalDocumentVersionId: memo.originalDocumentVersionId ?? null,
    documentTemplateId: memo.documentTemplateId ?? null,
    status: memo.status,
    createdBy: memo.createdBy,
    createdAt: memo.createdAt,
    updatedAt: memo.updatedAt,
  };
}
