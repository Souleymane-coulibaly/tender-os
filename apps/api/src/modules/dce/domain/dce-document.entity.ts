export type DceDocumentProps = {
  dceId: string;
  documentId: string;
  organizationId: string;
  createdByUserId: string;
  createdAt: Date;
};

/** Lien pur entre un Dce et un Document — même philosophie que DocumentTenderAssociation
 *  (module Documents) : aucune duplication de fichier, seulement une référence. Aucune mutation
 *  possible : seules la création et la suppression de la ligne existent. */
export class DceDocument {
  private constructor(private readonly props: DceDocumentProps) {}

  static create(input: {
    dceId: string;
    documentId: string;
    organizationId: string;
    createdByUserId: string;
    occurredAt: Date;
  }): DceDocument {
    return new DceDocument({
      dceId: input.dceId,
      documentId: input.documentId,
      organizationId: input.organizationId,
      createdByUserId: input.createdByUserId,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: DceDocumentProps): DceDocument {
    return new DceDocument(props);
  }

  get dceId(): string {
    return this.props.dceId;
  }
  get documentId(): string {
    return this.props.documentId;
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
