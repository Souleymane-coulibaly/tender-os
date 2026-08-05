import { BuyerProvidedFormTemplate } from "../domain/buyer-provided-form-template.aggregate";
import type { AdministrativeFormType } from "../domain/administrative-form-type";

export type PersistedBuyerProvidedFormTemplate = {
  id: string;
  organizationId: string;
  tenderId: string;
  documentType: string;
  documentId: string;
  documentVersionId: string;
  designatedBy: string;
  designatedAt: Date;
};

export function toDomainBuyerProvidedFormTemplate(record: PersistedBuyerProvidedFormTemplate): BuyerProvidedFormTemplate {
  return BuyerProvidedFormTemplate.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    documentType: record.documentType as AdministrativeFormType,
    documentId: record.documentId,
    documentVersionId: record.documentVersionId,
    designatedBy: record.designatedBy,
    designatedAt: record.designatedAt,
  });
}

export function toBuyerProvidedFormTemplateRow(template: BuyerProvidedFormTemplate) {
  return {
    id: template.id,
    organizationId: template.organizationId,
    tenderId: template.tenderId,
    documentType: template.documentType,
    documentId: template.documentId,
    documentVersionId: template.documentVersionId,
    designatedBy: template.designatedBy,
    designatedAt: template.designatedAt,
  };
}
