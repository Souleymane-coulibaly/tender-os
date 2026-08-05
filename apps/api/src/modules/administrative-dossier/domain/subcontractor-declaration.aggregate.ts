import type { AdministrativeDocumentType } from "./administrative-document-type";
import { InvalidSubcontractorAmountError } from "./errors";

export type SubcontractorDeclarationProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  subcontractorName: string;
  subcontractorLegalIdentifier?: string | undefined;
  servicesDescription: string;
  amountValue: number;
  amountCurrency: string;
  percentageOfTotal?: number | undefined;
  paymentTerms?: string | undefined;
  directPaymentApplicable?: boolean | undefined;
  requiredDocuments: readonly AdministrativeDocumentType[];
  administrativeDocumentId?: string | undefined;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Sprint 8C Phase 2 — mission §12 : une déclaration de sous-traitance (DC4), PLUSIEURS possibles
 * par Tender (mission "plusieurs DC4 doivent être possibles"). La cohérence montant/pourcentage
 * avec le pricing gelé de l'Acte d'engagement est vérifiée par le USE CASE (cet agrégat ne connaît
 * jamais le pricing — même séparation de responsabilité que `Deliverable`/`PricingEstimate`).
 */
export class SubcontractorDeclaration {
  private constructor(private props: SubcontractorDeclarationProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    subcontractorName: string;
    subcontractorLegalIdentifier?: string | undefined;
    servicesDescription: string;
    amountValue: number;
    amountCurrency: string;
    percentageOfTotal?: number | undefined;
    paymentTerms?: string | undefined;
    directPaymentApplicable?: boolean | undefined;
    requiredDocuments?: readonly AdministrativeDocumentType[] | undefined;
    createdBy: string;
    occurredAt: Date;
  }): SubcontractorDeclaration {
    if (input.amountValue < 0) {
      throw new InvalidSubcontractorAmountError("amountValue must not be negative");
    }
    if (input.percentageOfTotal !== undefined && (input.percentageOfTotal < 0 || input.percentageOfTotal > 100)) {
      throw new InvalidSubcontractorAmountError("percentageOfTotal must be between 0 and 100");
    }
    return new SubcontractorDeclaration({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      subcontractorName: input.subcontractorName,
      subcontractorLegalIdentifier: input.subcontractorLegalIdentifier,
      servicesDescription: input.servicesDescription,
      amountValue: input.amountValue,
      amountCurrency: input.amountCurrency,
      percentageOfTotal: input.percentageOfTotal,
      paymentTerms: input.paymentTerms,
      directPaymentApplicable: input.directPaymentApplicable,
      requiredDocuments: input.requiredDocuments ?? [],
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: SubcontractorDeclarationProps): SubcontractorDeclaration {
    return new SubcontractorDeclaration(props);
  }

  update(input: {
    subcontractorName?: string | undefined;
    servicesDescription?: string | undefined;
    amountValue?: number | undefined;
    amountCurrency?: string | undefined;
    percentageOfTotal?: number | undefined;
    paymentTerms?: string | undefined;
    directPaymentApplicable?: boolean | undefined;
    occurredAt: Date;
  }): void {
    if (input.amountValue !== undefined && input.amountValue < 0) {
      throw new InvalidSubcontractorAmountError("amountValue must not be negative");
    }
    if (input.percentageOfTotal !== undefined && (input.percentageOfTotal < 0 || input.percentageOfTotal > 100)) {
      throw new InvalidSubcontractorAmountError("percentageOfTotal must be between 0 and 100");
    }
    if (input.subcontractorName !== undefined) this.props.subcontractorName = input.subcontractorName;
    if (input.servicesDescription !== undefined) this.props.servicesDescription = input.servicesDescription;
    if (input.amountValue !== undefined) this.props.amountValue = input.amountValue;
    if (input.amountCurrency !== undefined) this.props.amountCurrency = input.amountCurrency;
    if (input.percentageOfTotal !== undefined) this.props.percentageOfTotal = input.percentageOfTotal;
    if (input.paymentTerms !== undefined) this.props.paymentTerms = input.paymentTerms;
    if (input.directPaymentApplicable !== undefined) this.props.directPaymentApplicable = input.directPaymentApplicable;
    this.props.updatedAt = input.occurredAt;
  }

  linkDocument(input: { administrativeDocumentId: string; occurredAt: Date }): void {
    this.props.administrativeDocumentId = input.administrativeDocumentId;
    this.props.updatedAt = input.occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get subcontractorName(): string {
    return this.props.subcontractorName;
  }
  get subcontractorLegalIdentifier(): string | undefined {
    return this.props.subcontractorLegalIdentifier;
  }
  get servicesDescription(): string {
    return this.props.servicesDescription;
  }
  get amountValue(): number {
    return this.props.amountValue;
  }
  get amountCurrency(): string {
    return this.props.amountCurrency;
  }
  get percentageOfTotal(): number | undefined {
    return this.props.percentageOfTotal;
  }
  get paymentTerms(): string | undefined {
    return this.props.paymentTerms;
  }
  get directPaymentApplicable(): boolean | undefined {
    return this.props.directPaymentApplicable;
  }
  get requiredDocuments(): readonly AdministrativeDocumentType[] {
    return this.props.requiredDocuments;
  }
  get administrativeDocumentId(): string | undefined {
    return this.props.administrativeDocumentId;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
