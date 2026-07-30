import { createHash } from "node:crypto";

export type KnowledgeChunkProps = {
  id: string;
  organizationId: string;
  knowledgeEntryId: string;
  knowledgeDocumentId: string;
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
 * Segment de texte exploitable par la recherche (mission Sprint 5 §7/§8) — même motif que
 * `ExtractionChunk` (module Extraction), volontairement une entité DISTINCTE : la table qui la
 * porte n'a jamais de dépendance vers un `DocumentExtraction` lié à un DCE/Tender (voir
 * `KnowledgeDocument`). Immuable : un nouveau traitement remplace un jeu de chunks entier, jamais
 * une mise à jour partielle.
 */
export class KnowledgeChunk {
  private constructor(private readonly props: KnowledgeChunkProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    knowledgeEntryId: string;
    knowledgeDocumentId: string;
    sequence: number;
    pageStart?: number | undefined;
    pageEnd?: number | undefined;
    sheetName?: string | undefined;
    sectionTitle?: string | undefined;
    content: string;
    tokenEstimate?: number | undefined;
    occurredAt: Date;
  }): KnowledgeChunk {
    return new KnowledgeChunk({
      id: input.id,
      organizationId: input.organizationId,
      knowledgeEntryId: input.knowledgeEntryId,
      knowledgeDocumentId: input.knowledgeDocumentId,
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

  static rehydrate(props: KnowledgeChunkProps): KnowledgeChunk {
    return new KnowledgeChunk(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get knowledgeEntryId(): string {
    return this.props.knowledgeEntryId;
  }
  get knowledgeDocumentId(): string {
    return this.props.knowledgeDocumentId;
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
