import type { GenerationOutputMode } from "./generation-output-mode";
import type { GenerationTaskType } from "./generation-task-type";

export type PromptTemplateProps = {
  id: string;
  organizationId: string;
  taskType: GenerationTaskType;
  name: string;
  description?: string | undefined;
  outputMode: GenerationOutputMode;
  structuredSchemaKey?: string | undefined;
  archivedAt?: Date | undefined;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Un template par (organisation, taskType) — pas de variantes concurrentes en MVP (mission Sprint 6
 * §"Prompt Management"). Ses versions (`PromptVersion`) portent le contenu réel ; le template
 * n'est qu'un en-tête stable (nom, mode de sortie, clé de schéma structuré) auquel les versions se
 * rattachent.
 */
export class PromptTemplate {
  private constructor(private props: PromptTemplateProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    taskType: GenerationTaskType;
    name: string;
    description?: string | undefined;
    outputMode: GenerationOutputMode;
    structuredSchemaKey?: string | undefined;
    createdBy: string;
    occurredAt: Date;
  }): PromptTemplate {
    return new PromptTemplate({
      id: input.id,
      organizationId: input.organizationId,
      taskType: input.taskType,
      name: input.name,
      description: input.description,
      outputMode: input.outputMode,
      structuredSchemaKey: input.structuredSchemaKey,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: PromptTemplateProps): PromptTemplate {
    return new PromptTemplate(props);
  }

  archive(occurredAt: Date): void {
    this.props.archivedAt = occurredAt;
    this.props.updatedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get taskType(): GenerationTaskType {
    return this.props.taskType;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string | undefined {
    return this.props.description;
  }
  get outputMode(): GenerationOutputMode {
    return this.props.outputMode;
  }
  get structuredSchemaKey(): string | undefined {
    return this.props.structuredSchemaKey;
  }
  get archivedAt(): Date | undefined {
    return this.props.archivedAt;
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
