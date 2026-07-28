import { DceDocumentCategory } from "./dce-document-category";
import { DceDocumentProcessingStatus } from "./dce-document-processing-status";

export type DceDocumentProps = {
  dceId: string;
  documentId: string;
  organizationId: string;
  createdByUserId: string;
  category: DceDocumentCategory;
  processingStatus: DceDocumentProcessingStatus;
  createdAt: Date;
  updatedAt: Date;
};

/** Lien pur entre un Dce et un Document — même philosophie que DocumentTenderAssociation
 *  (module Documents) : aucune duplication de fichier, seulement une référence. Porte en plus la
 *  classification et l'état de préparation OCR du fichier (mission architecture §7), propres au
 *  DCE et jamais au Document générique sous-jacent. */
export class DceDocument {
  private constructor(private props: DceDocumentProps) {}

  static create(input: {
    dceId: string;
    documentId: string;
    organizationId: string;
    createdByUserId: string;
    category: DceDocumentCategory;
    occurredAt: Date;
  }): DceDocument {
    return new DceDocument({
      dceId: input.dceId,
      documentId: input.documentId,
      organizationId: input.organizationId,
      createdByUserId: input.createdByUserId,
      category: input.category,
      processingStatus: DceDocumentProcessingStatus.Imported,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: DceDocumentProps): DceDocument {
    return new DceDocument(props);
  }

  /**
   * Préparation OCR/extraction (mission architecture §7, révisé §mission P1-3 — jamais le
   * traitement réel) : idempotent, comme `Dce.markImported`, pour rester sûr même si un futur
   * appelant le déclenche deux fois avec le même statut.
   */
  transitionProcessingStatus(next: DceDocumentProcessingStatus, occurredAt: Date): void {
    if (this.props.processingStatus === next) {
      return;
    }
    this.props.processingStatus = next;
    this.props.updatedAt = occurredAt;
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
  get category(): DceDocumentCategory {
    return this.props.category;
  }
  get processingStatus(): DceDocumentProcessingStatus {
    return this.props.processingStatus;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
