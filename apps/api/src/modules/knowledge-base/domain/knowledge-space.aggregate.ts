/** Nom fixe de l'espace principal créé par organisation (mission Sprint 5 §1 "Espaces de
 *  connaissances") — un seul espace par organisation dans cette tranche ; l'architecture
 *  (organizationId + name uniques) permet une extension future vers plusieurs espaces nommés
 *  sans migration de rupture, jamais sur-conçue au-delà de ce besoin actuel. */
export const DEFAULT_KNOWLEDGE_SPACE_NAME = "Base de connaissances";

export const KnowledgeSpaceStatus = {
  Active: "ACTIVE",
  Archived: "ARCHIVED",
} as const;
export type KnowledgeSpaceStatus = (typeof KnowledgeSpaceStatus)[keyof typeof KnowledgeSpaceStatus];

export type KnowledgeSpaceProps = {
  id: string;
  organizationId: string;
  name: string;
  description?: string | undefined;
  status: KnowledgeSpaceStatus;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Espace de connaissances organisationnel (mission Sprint 5 §1) — volontairement minimal : nom,
 * description, statut. Toujours résolu/créé par `GetOrCreateDefaultKnowledgeSpaceUseCase` de façon
 * idempotente (mission §"Si un espace par défaut est préférable, il doit être créé de manière
 * idempotente"), jamais dupliqué pour une même organisation.
 */
export class KnowledgeSpace {
  private constructor(private props: KnowledgeSpaceProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    name: string;
    description?: string | undefined;
    occurredAt: Date;
  }): KnowledgeSpace {
    return new KnowledgeSpace({
      id: input.id,
      organizationId: input.organizationId,
      name: input.name,
      description: input.description,
      status: KnowledgeSpaceStatus.Active,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: KnowledgeSpaceProps): KnowledgeSpace {
    return new KnowledgeSpace(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string | undefined {
    return this.props.description;
  }
  get status(): KnowledgeSpaceStatus {
    return this.props.status;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
