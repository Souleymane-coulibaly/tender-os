import { AdministrativeFormDraft } from "../domain/administrative-form-draft.aggregate";
import type { AdministrativeFormType } from "../domain/administrative-form-type";

export type PersistedAdministrativeFormDraft = {
  id: string;
  organizationId: string;
  tenderId: string;
  documentType: string;
  scopeId: string;
  data: unknown;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainAdministrativeFormDraft(record: PersistedAdministrativeFormDraft): AdministrativeFormDraft {
  return AdministrativeFormDraft.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    documentType: record.documentType as AdministrativeFormType,
    scopeId: record.scopeId,
    data: (record.data as Record<string, unknown> | null) ?? {},
    updatedBy: record.updatedBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toAdministrativeFormDraftRow(draft: AdministrativeFormDraft) {
  return {
    id: draft.id,
    organizationId: draft.organizationId,
    tenderId: draft.tenderId,
    documentType: draft.documentType,
    scopeId: draft.scopeId,
    data: draft.data as object,
    updatedBy: draft.updatedBy,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}
