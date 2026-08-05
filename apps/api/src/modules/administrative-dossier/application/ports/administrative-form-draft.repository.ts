import type { AdministrativeFormDraft } from "../../domain/administrative-form-draft.aggregate";
import type { AdministrativeFormType } from "../../domain/administrative-form-type";

export interface AdministrativeFormDraftRepository {
  create(draft: AdministrativeFormDraft): Promise<void>;
  find(input: { organizationId: string; tenderId: string; documentType: AdministrativeFormType; scopeId: string }): Promise<AdministrativeFormDraft | null>;
  save(draft: AdministrativeFormDraft): Promise<void>;
}

export const ADMINISTRATIVE_FORM_DRAFT_REPOSITORY = Symbol("ADMINISTRATIVE_FORM_DRAFT_REPOSITORY");
