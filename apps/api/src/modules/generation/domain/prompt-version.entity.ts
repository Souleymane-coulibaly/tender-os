import { ALLOWED_PROMPT_VERSION_TRANSITIONS, PromptVersionStatus } from "./prompt-version-status";
import { InvalidPromptVersionStatusTransitionError } from "./errors";

export type PromptVersionProps = {
  id: string;
  organizationId: string;
  promptTemplateId: string;
  version: number;
  status: PromptVersionStatus;
  systemPrompt: string;
  userPromptTemplate: string;
  requiredVariables: readonly string[];
  authorUserId: string;
  effectiveFrom?: Date | undefined;
  archivedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Une version d'un `PromptTemplate` — créée DRAFT, jamais active d'emblée (même discipline que
 * `RoutingPolicy`, Sprint 5.2). Au plus UNE version ACTIVE par (organizationId, promptTemplateId) à
 * tout instant — garanti par un index unique partiel côté Prisma ; `activate()` ne fait ici que la
 * moitié applicative de cette invariante (l'autre moitié, l'archivage atomique de l'éventuelle
 * version ACTIVE précédente, vit dans `PromptVersionRepository.activateAtomically`, dans la même
 * transaction courte). Une fois ACTIVÉE puis ARCHIVÉE, son contenu ne change plus jamais — toute
 * `Generation` créée pendant qu'elle était active continue de la référencer par id et par numéro
 * (`promptVersionNumber` gelé sur la ligne de génération), jamais recalculée.
 */
export class PromptVersion {
  private constructor(private props: PromptVersionProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    promptTemplateId: string;
    version: number;
    systemPrompt: string;
    userPromptTemplate: string;
    requiredVariables: readonly string[];
    authorUserId: string;
    occurredAt: Date;
  }): PromptVersion {
    return new PromptVersion({
      id: input.id,
      organizationId: input.organizationId,
      promptTemplateId: input.promptTemplateId,
      version: input.version,
      status: PromptVersionStatus.Draft,
      systemPrompt: input.systemPrompt,
      userPromptTemplate: input.userPromptTemplate,
      requiredVariables: input.requiredVariables,
      authorUserId: input.authorUserId,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: PromptVersionProps): PromptVersion {
    return new PromptVersion(props);
  }

  private transitionTo(next: PromptVersionStatus, occurredAt: Date): void {
    const allowed = ALLOWED_PROMPT_VERSION_TRANSITIONS[this.props.status];
    if (!allowed.includes(next)) {
      throw new InvalidPromptVersionStatusTransitionError({ from: this.props.status, to: next });
    }
    this.props.status = next;
    this.props.updatedAt = occurredAt;
  }

  activate(occurredAt: Date): void {
    this.transitionTo(PromptVersionStatus.Active, occurredAt);
    this.props.effectiveFrom = occurredAt;
  }

  archive(occurredAt: Date): void {
    this.transitionTo(PromptVersionStatus.Archived, occurredAt);
    this.props.archivedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get promptTemplateId(): string {
    return this.props.promptTemplateId;
  }
  get version(): number {
    return this.props.version;
  }
  get status(): PromptVersionStatus {
    return this.props.status;
  }
  get systemPrompt(): string {
    return this.props.systemPrompt;
  }
  get userPromptTemplate(): string {
    return this.props.userPromptTemplate;
  }
  get requiredVariables(): readonly string[] {
    return this.props.requiredVariables;
  }
  get authorUserId(): string {
    return this.props.authorUserId;
  }
  get effectiveFrom(): Date | undefined {
    return this.props.effectiveFrom;
  }
  get archivedAt(): Date | undefined {
    return this.props.archivedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
