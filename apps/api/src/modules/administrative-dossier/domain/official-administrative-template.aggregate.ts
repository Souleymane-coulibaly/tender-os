import type { AdministrativeFormType } from "./administrative-form-type";

export type OfficialAdministrativeTemplateProps = {
  id: string;
  organizationId?: string | undefined;
  documentType: AdministrativeFormType;
  officialName: string;
  version: number;
  sourceAuthority: string;
  sourceReference: string;
  publishedAt?: Date | undefined;
  importedAt: Date;
  fileDocumentId: string;
  fileDocumentVersionId: string;
  hash: string;
  active: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Sprint 8C.1 — le gabarit officiel DAJ (DC1/DC2/DC4/ATTRI1), stocké TEL QUEL — jamais modifié,
 * jamais patché. `fileDocumentId`/`fileDocumentVersionId` pointent vers un `Document` réel du
 * module Documents (mission "aucun binaire en base"). Une seule ligne `active` par
 * (organizationId, documentType) — l'atomicité du remplacement est garantie par le repository
 * (transaction courte, même motif que `ExportTemplateVersion.activateAtomically`), jamais un
 * remplacement en place.
 */
export class OfficialAdministrativeTemplate {
  private constructor(private props: OfficialAdministrativeTemplateProps) {}

  static create(input: {
    id: string;
    organizationId?: string | undefined;
    documentType: AdministrativeFormType;
    officialName: string;
    version: number;
    sourceAuthority: string;
    sourceReference: string;
    publishedAt?: Date | undefined;
    fileDocumentId: string;
    fileDocumentVersionId: string;
    hash: string;
    createdBy: string;
    occurredAt: Date;
  }): OfficialAdministrativeTemplate {
    return new OfficialAdministrativeTemplate({
      id: input.id,
      organizationId: input.organizationId,
      documentType: input.documentType,
      officialName: input.officialName,
      version: input.version,
      sourceAuthority: input.sourceAuthority,
      sourceReference: input.sourceReference,
      publishedAt: input.publishedAt,
      importedAt: input.occurredAt,
      fileDocumentId: input.fileDocumentId,
      fileDocumentVersionId: input.fileDocumentVersionId,
      hash: input.hash,
      active: true,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: OfficialAdministrativeTemplateProps): OfficialAdministrativeTemplate {
    return new OfficialAdministrativeTemplate(props);
  }

  /** Appelée sur l'ANCIENNE version active au moment où une nouvelle est activée — jamais un
   *  remplacement en place du contenu. */
  deactivate(occurredAt: Date): void {
    this.props.active = false;
    this.props.updatedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string | undefined {
    return this.props.organizationId;
  }
  get documentType(): AdministrativeFormType {
    return this.props.documentType;
  }
  get officialName(): string {
    return this.props.officialName;
  }
  get version(): number {
    return this.props.version;
  }
  get sourceAuthority(): string {
    return this.props.sourceAuthority;
  }
  get sourceReference(): string {
    return this.props.sourceReference;
  }
  get publishedAt(): Date | undefined {
    return this.props.publishedAt;
  }
  get importedAt(): Date {
    return this.props.importedAt;
  }
  get fileDocumentId(): string {
    return this.props.fileDocumentId;
  }
  get fileDocumentVersionId(): string {
    return this.props.fileDocumentVersionId;
  }
  get hash(): string {
    return this.props.hash;
  }
  get active(): boolean {
    return this.props.active;
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
