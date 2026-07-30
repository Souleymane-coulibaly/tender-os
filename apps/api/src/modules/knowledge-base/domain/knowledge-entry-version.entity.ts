export type KnowledgeEntryVersionSnapshot = Readonly<{
  title: string;
  description?: string | undefined;
  category: string;
  language?: string | undefined;
  metadata: Record<string, unknown>;
  knowledgeDocumentId?: string | undefined;
}>;

export type KnowledgeEntryVersionProps = {
  id: string;
  organizationId: string;
  knowledgeEntryId: string;
  versionNumber: number;
  /** Motif court, facultatif (mission §10 "motif éventuel") — ex. "document remplacé",
   *  "métadonnées mises à jour", "restauration de la version 2". */
  reason?: string | undefined;
  snapshot: KnowledgeEntryVersionSnapshot;
  createdByUserId: string;
  createdAt: Date;
};

/**
 * Version immuable d'une entrée de connaissance (mission Sprint 5 §10 "Versionnement") — même
 * motif que `DocumentVersion` (module Documents) : aucune méthode de mutation, une nouvelle version
 * ne modifie jamais une version existante, elle en crée toujours une nouvelle ligne. Une
 * restauration crée elle-même une NOUVELLE version dont le `snapshot` copie celui restauré —
 * jamais un rollback destructif de l'historique.
 */
export class KnowledgeEntryVersion {
  private constructor(private readonly props: KnowledgeEntryVersionProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    knowledgeEntryId: string;
    versionNumber: number;
    reason?: string | undefined;
    snapshot: KnowledgeEntryVersionSnapshot;
    createdByUserId: string;
    occurredAt: Date;
  }): KnowledgeEntryVersion {
    return new KnowledgeEntryVersion({
      id: input.id,
      organizationId: input.organizationId,
      knowledgeEntryId: input.knowledgeEntryId,
      versionNumber: input.versionNumber,
      reason: input.reason,
      snapshot: input.snapshot,
      createdByUserId: input.createdByUserId,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: KnowledgeEntryVersionProps): KnowledgeEntryVersion {
    return new KnowledgeEntryVersion(props);
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
  get versionNumber(): number {
    return this.props.versionNumber;
  }
  get reason(): string | undefined {
    return this.props.reason;
  }
  get snapshot(): KnowledgeEntryVersionSnapshot {
    return this.props.snapshot;
  }
  get createdByUserId(): string {
    return this.props.createdByUserId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
