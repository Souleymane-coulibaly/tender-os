import { ALLOWED_DOCUMENT_TEMPLATE_VERSION_TRANSITIONS, DocumentTemplateVersionStatus } from "./document-template-version-status";
import type { DocumentTemplateFieldMapping } from "./document-template-field-mapping";
import { InvalidDocumentTemplateVersionStatusTransitionError } from "./errors";

/** Un placeholder réellement détecté par le parseur OOXML à l'upload (mission "aucune valeur
 *  inventée" — base de la détection de champs orphelins/non mappés). */
export type DiscoveredPlaceholder = Readonly<{ fieldKey: string; occurrences: number }>;

export type DocumentTemplateVersionProps = {
  id: string;
  organizationId: string;
  documentTemplateId: string;
  version: number;
  status: DocumentTemplateVersionStatus;
  sourceDocumentId: string;
  sourceDocumentVersionId: string;
  sourceChecksum: string;
  discoveredPlaceholders: readonly DiscoveredPlaceholder[];
  allowPartialGeneration: boolean;
  fieldMappings: readonly DocumentTemplateFieldMapping[];
  createdBy: string;
  createdAt: Date;
  activatedAt?: Date | undefined;
  archivedAt?: Date | undefined;
};

/** Créée DRAFT, jamais active d'emblée — même discipline qu'`ExportTemplateVersion`/`PromptVersion`.
 *  Une fois ACTIVE, le fichier source (`sourceDocumentVersionId`/`sourceChecksum`) et les Field
 *  Mappings ne changent plus JAMAIS (mission "ne jamais modifier template.docx en place" — toute
 *  évolution crée une NOUVELLE version) : seul `status` transite ensuite vers ARCHIVED. */
export class DocumentTemplateVersion {
  private constructor(private props: DocumentTemplateVersionProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    documentTemplateId: string;
    version: number;
    sourceDocumentId: string;
    sourceDocumentVersionId: string;
    sourceChecksum: string;
    discoveredPlaceholders: readonly DiscoveredPlaceholder[];
    allowPartialGeneration: boolean;
    fieldMappings: readonly DocumentTemplateFieldMapping[];
    createdBy: string;
    occurredAt: Date;
  }): DocumentTemplateVersion {
    return new DocumentTemplateVersion({
      id: input.id,
      organizationId: input.organizationId,
      documentTemplateId: input.documentTemplateId,
      version: input.version,
      status: DocumentTemplateVersionStatus.Draft,
      sourceDocumentId: input.sourceDocumentId,
      sourceDocumentVersionId: input.sourceDocumentVersionId,
      sourceChecksum: input.sourceChecksum,
      discoveredPlaceholders: input.discoveredPlaceholders,
      allowPartialGeneration: input.allowPartialGeneration,
      fieldMappings: input.fieldMappings,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: DocumentTemplateVersionProps): DocumentTemplateVersion {
    return new DocumentTemplateVersion(props);
  }

  private transitionTo(next: DocumentTemplateVersionStatus, occurredAt: Date): void {
    if (!ALLOWED_DOCUMENT_TEMPLATE_VERSION_TRANSITIONS[this.props.status].includes(next)) {
      throw new InvalidDocumentTemplateVersionStatusTransitionError({ from: this.props.status, to: next });
    }
    this.props.status = next;
    if (next === DocumentTemplateVersionStatus.Active) this.props.activatedAt = occurredAt;
    if (next === DocumentTemplateVersionStatus.Archived) this.props.archivedAt = occurredAt;
  }

  activate(occurredAt: Date): void {
    this.transitionTo(DocumentTemplateVersionStatus.Active, occurredAt);
  }

  archive(occurredAt: Date): void {
    this.transitionTo(DocumentTemplateVersionStatus.Archived, occurredAt);
  }

  /** Champs requis (Field Mapping) sans valeur fournie dans `providedFieldKeys` — jamais une
   *  valeur inventée à la place (mission "produire une liste missingFields"). */
  computeMissingRequiredFields(providedFieldKeys: ReadonlySet<string>): readonly string[] {
    return this.props.fieldMappings.filter((mapping) => mapping.required && !providedFieldKeys.has(mapping.fieldKey)).map((mapping) => mapping.fieldKey);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get documentTemplateId(): string {
    return this.props.documentTemplateId;
  }
  get version(): number {
    return this.props.version;
  }
  get status(): DocumentTemplateVersionStatus {
    return this.props.status;
  }
  get sourceDocumentId(): string {
    return this.props.sourceDocumentId;
  }
  get sourceDocumentVersionId(): string {
    return this.props.sourceDocumentVersionId;
  }
  get sourceChecksum(): string {
    return this.props.sourceChecksum;
  }
  get discoveredPlaceholders(): readonly DiscoveredPlaceholder[] {
    return this.props.discoveredPlaceholders;
  }
  get allowPartialGeneration(): boolean {
    return this.props.allowPartialGeneration;
  }
  get fieldMappings(): readonly DocumentTemplateFieldMapping[] {
    return this.props.fieldMappings;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get activatedAt(): Date | undefined {
    return this.props.activatedAt;
  }
  get archivedAt(): Date | undefined {
    return this.props.archivedAt;
  }
}
