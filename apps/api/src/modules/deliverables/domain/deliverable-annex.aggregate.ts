import { AnnexStatus } from "./annex-status";

export type DeliverableAnnexProps = {
  id: string;
  organizationId: string;
  deliverableId: string;
  label: string;
  source?: string | undefined;
  documentId?: string | undefined;
  version?: string | undefined;
  /** Correctif audit Codex P1-003 — référence de version IMMUABLE dérivée du document VÉRIFIÉ
   *  (jamais fournie par le client), même motif que `ChecklistPieceEntry`. */
  documentVersionId?: string | undefined;
  documentChecksum?: string | undefined;
  documentFileName?: string | undefined;
  documentMimeType?: string | undefined;
  status: AnnexStatus;
  order: number;
  createdBy: string;
  createdAt: Date;
};

const MAX_LABEL_LENGTH = 300;

/** Mission §14 — annexes (références, CV, certifications, fiches techniques, organigrammes,
 *  plannings, preuves) : overlay léger, ordre/version/source/statut conservés. */
export class DeliverableAnnex {
  private constructor(private props: DeliverableAnnexProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    deliverableId: string;
    label: string;
    source?: string | undefined;
    documentId?: string | undefined;
    version?: string | undefined;
    /** Correctif audit Codex P1-003 — dérivés d'un document déjà vérifié par l'appelant (jamais
     *  des valeurs fournies directement par le client) quand `documentId` est renseigné. */
    documentVersionId?: string | undefined;
    documentChecksum?: string | undefined;
    documentFileName?: string | undefined;
    documentMimeType?: string | undefined;
    order: number;
    createdBy: string;
    occurredAt: Date;
  }): DeliverableAnnex {
    const label = input.label.trim();
    if (!label || label.length > MAX_LABEL_LENGTH) {
      throw new Error(`label must be between 1 and ${MAX_LABEL_LENGTH} characters`);
    }
    return new DeliverableAnnex({
      id: input.id,
      organizationId: input.organizationId,
      deliverableId: input.deliverableId,
      label,
      source: input.source,
      documentId: input.documentId,
      version: input.version,
      documentVersionId: input.documentVersionId,
      documentChecksum: input.documentChecksum,
      documentFileName: input.documentFileName,
      documentMimeType: input.documentMimeType,
      status: input.documentId ? AnnexStatus.Provided : AnnexStatus.Pending,
      order: input.order,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: DeliverableAnnexProps): DeliverableAnnex {
    return new DeliverableAnnex(props);
  }

  changeStatus(status: AnnexStatus): void {
    this.props.status = status;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get deliverableId(): string {
    return this.props.deliverableId;
  }
  get label(): string {
    return this.props.label;
  }
  get source(): string | undefined {
    return this.props.source;
  }
  get documentId(): string | undefined {
    return this.props.documentId;
  }
  get version(): string | undefined {
    return this.props.version;
  }
  get documentVersionId(): string | undefined {
    return this.props.documentVersionId;
  }
  get documentChecksum(): string | undefined {
    return this.props.documentChecksum;
  }
  get documentFileName(): string | undefined {
    return this.props.documentFileName;
  }
  get documentMimeType(): string | undefined {
    return this.props.documentMimeType;
  }
  get status(): AnnexStatus {
    return this.props.status;
  }
  get order(): number {
    return this.props.order;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
