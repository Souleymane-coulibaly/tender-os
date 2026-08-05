import type { AdministrativeFormType } from "./administrative-form-type";

export type BuyerProvidedFormTemplateProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  documentType: AdministrativeFormType;
  documentId: string;
  documentVersionId: string;
  designatedBy: string;
  designatedAt: Date;
};

/**
 * Sprint 8C.1 — mission §3 : désignation manuelle explicite d'un document DCE déjà importé comme
 * modèle acheteur prioritaire pour un type de formulaire — jamais une détection automatique par
 * contenu. Un seul modèle acheteur actif par (Tender, type de formulaire) ; redésigner un autre
 * document REMPLACE explicitement la désignation précédente, jamais un ajout silencieux.
 */
export class BuyerProvidedFormTemplate {
  private constructor(private props: BuyerProvidedFormTemplateProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    documentType: AdministrativeFormType;
    documentId: string;
    documentVersionId: string;
    designatedBy: string;
    occurredAt: Date;
  }): BuyerProvidedFormTemplate {
    return new BuyerProvidedFormTemplate({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      documentType: input.documentType,
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      designatedBy: input.designatedBy,
      designatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: BuyerProvidedFormTemplateProps): BuyerProvidedFormTemplate {
    return new BuyerProvidedFormTemplate(props);
  }

  redesignate(input: { documentId: string; documentVersionId: string; designatedBy: string; occurredAt: Date }): void {
    this.props.documentId = input.documentId;
    this.props.documentVersionId = input.documentVersionId;
    this.props.designatedBy = input.designatedBy;
    this.props.designatedAt = input.occurredAt;
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
  get documentType(): AdministrativeFormType {
    return this.props.documentType;
  }
  get documentId(): string {
    return this.props.documentId;
  }
  get documentVersionId(): string {
    return this.props.documentVersionId;
  }
  get designatedBy(): string {
    return this.props.designatedBy;
  }
  get designatedAt(): Date {
    return this.props.designatedAt;
  }
}
