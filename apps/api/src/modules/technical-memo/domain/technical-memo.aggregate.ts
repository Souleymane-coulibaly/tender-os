import { TechnicalMemoStatus, TechnicalMemoTemplateOrigin } from "./enums";

export type TechnicalMemoProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  clientAccountId: string;
  lotId?: string | undefined;
  templateOrigin: TechnicalMemoTemplateOrigin;
  originalDocumentId?: string | undefined;
  originalDocumentVersionId?: string | undefined;
  documentTemplateId?: string | undefined;
  status: TechnicalMemoStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Racine d'agrégat — un mémoire par (Tender, lot optionnel). Mission §7 : l'original uploadé
 *  (COMPANY_TEMPLATE/DCE_REQUIRED_TEMPLATE) n'est référencé qu'en LECTURE SEULE ici, jamais modifié
 *  par cet agrégat — la préparation du gabarit dérivé exploitable (`documentTemplateId`) est un
 *  processus séparé (voir `PrepareTechnicalMemoTemplateUseCase`). */
export class TechnicalMemo {
  private constructor(private props: TechnicalMemoProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    clientAccountId: string;
    lotId?: string | undefined;
    templateOrigin: TechnicalMemoTemplateOrigin;
    originalDocumentId?: string | undefined;
    originalDocumentVersionId?: string | undefined;
    createdBy: string;
    occurredAt: Date;
  }): TechnicalMemo {
    if (input.templateOrigin !== TechnicalMemoTemplateOrigin.TenderOsSystem && !input.originalDocumentId) {
      throw new Error("originalDocumentId is required for COMPANY_TEMPLATE/DCE_REQUIRED_TEMPLATE origins.");
    }
    return new TechnicalMemo({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      clientAccountId: input.clientAccountId,
      lotId: input.lotId,
      templateOrigin: input.templateOrigin,
      originalDocumentId: input.originalDocumentId,
      originalDocumentVersionId: input.originalDocumentVersionId,
      status: TechnicalMemoStatus.Draft,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: TechnicalMemoProps): TechnicalMemo {
    return new TechnicalMemo(props);
  }

  /** Renseigné une fois le gabarit dérivé préparé (mission §9 "analyse ≠ modification" — jamais
   *  avant que la structure ait été effectivement analysée). */
  attachDocumentTemplate(input: { documentTemplateId: string; occurredAt: Date }): void {
    this.props.documentTemplateId = input.documentTemplateId;
    this.props.status = TechnicalMemoStatus.Ready;
    this.props.updatedAt = input.occurredAt;
  }

  markExported(occurredAt: Date): void {
    this.props.status = TechnicalMemoStatus.Exported;
    this.props.updatedAt = occurredAt;
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
  get clientAccountId(): string {
    return this.props.clientAccountId;
  }
  get lotId(): string | undefined {
    return this.props.lotId;
  }
  get templateOrigin(): TechnicalMemoTemplateOrigin {
    return this.props.templateOrigin;
  }
  get originalDocumentId(): string | undefined {
    return this.props.originalDocumentId;
  }
  get originalDocumentVersionId(): string | undefined {
    return this.props.originalDocumentVersionId;
  }
  get documentTemplateId(): string | undefined {
    return this.props.documentTemplateId;
  }
  get status(): TechnicalMemoStatus {
    return this.props.status;
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
