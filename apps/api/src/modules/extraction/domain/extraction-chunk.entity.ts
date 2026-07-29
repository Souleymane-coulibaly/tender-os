import { createHash } from "node:crypto";

export type ExtractionChunkProps = {
  id: string;
  documentId: string;
  organizationId: string;
  /** Ordre stable au sein du document (mission §13 "conserve l'ordre") — jamais recalculé après
   *  coup, toujours réattribué en bloc par la segmentation qui remplace un jeu de chunks. */
  sequence: number;
  pageStart?: number | undefined;
  pageEnd?: number | undefined;
  sheetName?: string | undefined;
  sectionTitle?: string | undefined;
  content: string;
  characterCount: number;
  tokenEstimate?: number | undefined;
  checksum: string;
  createdAt: Date;
};

/**
 * Segment de texte exploitable par la future analyse IA (mission §13) — jamais un embedding,
 * jamais un vecteur : ce sprint ne branche aucun modèle d'embeddings (hors périmètre explicite).
 * Immuable : une resegmentation remplace un jeu de chunks entier, jamais une mise à jour partielle
 * (voir DocumentExtractionRepository.replaceChunks).
 */
export class ExtractionChunk {
  private constructor(private readonly props: ExtractionChunkProps) {}

  static create(input: {
    id: string;
    documentId: string;
    organizationId: string;
    sequence: number;
    pageStart?: number | undefined;
    pageEnd?: number | undefined;
    sheetName?: string | undefined;
    sectionTitle?: string | undefined;
    content: string;
    tokenEstimate?: number | undefined;
    occurredAt: Date;
  }): ExtractionChunk {
    return new ExtractionChunk({
      id: input.id,
      documentId: input.documentId,
      organizationId: input.organizationId,
      sequence: input.sequence,
      pageStart: input.pageStart,
      pageEnd: input.pageEnd,
      sheetName: input.sheetName,
      sectionTitle: input.sectionTitle,
      content: input.content,
      characterCount: input.content.length,
      tokenEstimate: input.tokenEstimate,
      checksum: createHash("sha256").update(input.content).digest("hex"),
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: ExtractionChunkProps): ExtractionChunk {
    return new ExtractionChunk(props);
  }

  get id(): string {
    return this.props.id;
  }
  get documentId(): string {
    return this.props.documentId;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get sequence(): number {
    return this.props.sequence;
  }
  get pageStart(): number | undefined {
    return this.props.pageStart;
  }
  get pageEnd(): number | undefined {
    return this.props.pageEnd;
  }
  get sheetName(): string | undefined {
    return this.props.sheetName;
  }
  get sectionTitle(): string | undefined {
    return this.props.sectionTitle;
  }
  get content(): string {
    return this.props.content;
  }
  get characterCount(): number {
    return this.props.characterCount;
  }
  get tokenEstimate(): number | undefined {
    return this.props.tokenEstimate;
  }
  get checksum(): string {
    return this.props.checksum;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
