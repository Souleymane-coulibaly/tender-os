export type DocumentTenderAssociationProps = {
  documentId: string;
  tenderId: string;
  organizationId: string;
  createdByUserId: string;
  createdAt: Date;
};

/** Lien pur entre un Document et un Tender — pas de duplication de fichier, seulement une
 *  référence (conception §D). Aucune mutation possible : seules la création et la suppression
 *  de la ligne existent. */
export class DocumentTenderAssociation {
  private constructor(private readonly props: DocumentTenderAssociationProps) {}

  static create(input: {
    documentId: string;
    tenderId: string;
    organizationId: string;
    createdByUserId: string;
    occurredAt: Date;
  }): DocumentTenderAssociation {
    return new DocumentTenderAssociation({
      documentId: input.documentId,
      tenderId: input.tenderId,
      organizationId: input.organizationId,
      createdByUserId: input.createdByUserId,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: DocumentTenderAssociationProps): DocumentTenderAssociation {
    return new DocumentTenderAssociation(props);
  }

  get documentId(): string {
    return this.props.documentId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get createdByUserId(): string {
    return this.props.createdByUserId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
