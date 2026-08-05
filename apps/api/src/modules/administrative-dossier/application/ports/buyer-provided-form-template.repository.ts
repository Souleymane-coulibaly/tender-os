import type { AdministrativeFormType } from "../../domain/administrative-form-type";
import type { BuyerProvidedFormTemplate } from "../../domain/buyer-provided-form-template.aggregate";

export interface BuyerProvidedFormTemplateRepository {
  create(template: BuyerProvidedFormTemplate): Promise<void>;
  find(input: { organizationId: string; tenderId: string; documentType: AdministrativeFormType }): Promise<BuyerProvidedFormTemplate | null>;
  save(template: BuyerProvidedFormTemplate): Promise<void>;
}

export const BUYER_PROVIDED_FORM_TEMPLATE_REPOSITORY = Symbol("BUYER_PROVIDED_FORM_TEMPLATE_REPOSITORY");
