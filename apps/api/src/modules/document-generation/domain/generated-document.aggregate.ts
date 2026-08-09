export type GeneratedDocumentProps = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  documentTemplateId: string;
  title: string;
  /** V2 Sprint 11B — voir le commentaire du modèle Prisma : clé de portée générique permettant
   *  plusieurs lignées indépendantes pour un même (tenderId, documentTemplateId). */
  subjectId?: string | undefined;
  createdBy: string;
  createdAt: Date;
};

const MAX_TITLE_LENGTH = 200;

/** Racine d'agrégat — une lignée de générations pour un même (Tender, Template) : les révisions
 *  successives (régénérations) s'accumulent EN DESSOUS via `GeneratedDocumentRevision`, jamais en
 *  écrasant (mission "historique de Révisions en append-only"). Ce type lui-même est immuable après
 *  création — rien ici ne change jamais, seules des révisions s'ajoutent. */
export class GeneratedDocument {
  private constructor(private readonly props: GeneratedDocumentProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    clientAccountId: string;
    tenderId: string;
    documentTemplateId: string;
    title: string;
    subjectId?: string | undefined;
    createdBy: string;
    occurredAt: Date;
  }): GeneratedDocument {
    const trimmedTitle = input.title.trim();
    if (!trimmedTitle || trimmedTitle.length > MAX_TITLE_LENGTH) {
      throw new Error(`title must be between 1 and ${MAX_TITLE_LENGTH} characters`);
    }
    return new GeneratedDocument({
      id: input.id,
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      tenderId: input.tenderId,
      documentTemplateId: input.documentTemplateId,
      title: trimmedTitle,
      subjectId: input.subjectId,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: GeneratedDocumentProps): GeneratedDocument {
    return new GeneratedDocument(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get clientAccountId(): string {
    return this.props.clientAccountId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get documentTemplateId(): string {
    return this.props.documentTemplateId;
  }
  get title(): string {
    return this.props.title;
  }
  get subjectId(): string | undefined {
    return this.props.subjectId;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
