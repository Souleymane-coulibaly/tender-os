import type { ExportDocumentType } from "./export-document-type";

export type ExportTemplateProps = {
  id: string;
  organizationId: string;
  documentType: ExportDocumentType;
  name: string;
  description?: string | undefined;
  createdBy: string;
  createdAt: Date;
};

const MAX_NAME_LENGTH = 200;

/** Mission Sprint 8A §16 — identité stable d'un template (organisation-scope uniquement, jamais
 *  client/tender — même motif que `PromptTemplate`, Sprint 6). Le contenu réel vit exclusivement
 *  sur `ExportTemplateVersion`. */
export class ExportTemplate {
  private constructor(private readonly props: ExportTemplateProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    documentType: ExportDocumentType;
    name: string;
    description?: string | undefined;
    createdBy: string;
    occurredAt: Date;
  }): ExportTemplate {
    const trimmedName = input.name.trim();
    if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH) {
      throw new Error(`name must be between 1 and ${MAX_NAME_LENGTH} characters`);
    }
    return new ExportTemplate({
      id: input.id,
      organizationId: input.organizationId,
      documentType: input.documentType,
      name: trimmedName,
      description: input.description,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: ExportTemplateProps): ExportTemplate {
    return new ExportTemplate(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get documentType(): ExportDocumentType {
    return this.props.documentType;
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
}
