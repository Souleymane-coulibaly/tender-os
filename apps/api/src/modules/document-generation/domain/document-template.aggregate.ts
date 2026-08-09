import type { DocumentTemplateScope } from "./document-template-scope";

export type DocumentTemplateProps = {
  id: string;
  organizationId: string;
  scope: DocumentTemplateScope;
  name: string;
  description?: string | undefined;
  createdBy: string;
  createdAt: Date;
  archivedAt?: Date | undefined;
};

const MAX_NAME_LENGTH = 200;

/** Identité stable d'un template (mission "générique, jamais DC1/DC2/DC4/ATTRI1 codé en dur") — le
 *  fichier .docx réel et sa configuration vivent exclusivement sur `DocumentTemplateVersion`, même
 *  motif qu'`ExportTemplate`/`ExportTemplateVersion`. */
export class DocumentTemplate {
  private constructor(private readonly props: DocumentTemplateProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    scope: DocumentTemplateScope;
    name: string;
    description?: string | undefined;
    createdBy: string;
    occurredAt: Date;
  }): DocumentTemplate {
    const trimmedName = input.name.trim();
    if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH) {
      throw new Error(`name must be between 1 and ${MAX_NAME_LENGTH} characters`);
    }
    return new DocumentTemplate({
      id: input.id,
      organizationId: input.organizationId,
      scope: input.scope,
      name: trimmedName,
      description: input.description,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: DocumentTemplateProps): DocumentTemplate {
    return new DocumentTemplate(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get scope(): DocumentTemplateScope {
    return this.props.scope;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string | undefined {
    return this.props.description;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get archivedAt(): Date | undefined {
    return this.props.archivedAt;
  }
}
