import { isModelKeyAllowed } from "./allowed-model-catalog";
import { AiModelStatus } from "./ai-model-status";
import { DEFAULT_AI_MODEL_CAPABILITIES, type AiModelCapabilities } from "./ai-model-capability";
import { AiModelDisabledError, ModelKeyNotAllowedError } from "./errors";

export type AiModelProps = {
  id: string;
  provider: string;
  modelKey: string;
  displayName: string;
  status: AiModelStatus;
  capabilities: AiModelCapabilities;
  maxContextTokens?: number | undefined;
  enabledForBenchmark: boolean;
  enabledForProduction: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Entrée du registre des modèles IA autorisés (Sprint 5.2 §"Registre des modèles") — le SEUL
 * endroit où un couple (provider, modelKey) devient utilisable ailleurs dans le module (benchmark,
 * recommandation, routing). Ne connaît ni Prisma, ni NestJS, ni le SDK d'un fournisseur.
 *
 * `enabledForBenchmark` et `enabledForProduction` sont deux drapeaux indépendants (mission
 * §"un modèle benchmark-only ne doit pas être utilisé en production" / §"un modèle production-only
 * peut être exclu des benchmarks") — jamais déduits l'un de l'autre.
 */
export class AiModel {
  private constructor(private props: AiModelProps) {}

  static create(input: {
    id: string;
    provider: string;
    modelKey: string;
    displayName: string;
    capabilities?: AiModelCapabilities | undefined;
    maxContextTokens?: number | undefined;
    enabledForBenchmark?: boolean | undefined;
    enabledForProduction?: boolean | undefined;
    occurredAt: Date;
  }): AiModel {
    if (!isModelKeyAllowed(input.provider, input.modelKey)) {
      throw new ModelKeyNotAllowedError({ provider: input.provider, modelKey: input.modelKey });
    }

    return new AiModel({
      id: input.id,
      provider: input.provider,
      modelKey: input.modelKey,
      displayName: input.displayName,
      status: AiModelStatus.Enabled,
      capabilities: input.capabilities ?? DEFAULT_AI_MODEL_CAPABILITIES,
      maxContextTokens: input.maxContextTokens,
      enabledForBenchmark: input.enabledForBenchmark ?? false,
      enabledForProduction: input.enabledForProduction ?? false,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: AiModelProps): AiModel {
    return new AiModel(props);
  }

  update(
    update: {
      displayName?: string | undefined;
      capabilities?: AiModelCapabilities | undefined;
      maxContextTokens?: number | undefined;
      enabledForBenchmark?: boolean | undefined;
      enabledForProduction?: boolean | undefined;
    },
    occurredAt: Date,
  ): void {
    if (update.displayName !== undefined) this.props.displayName = update.displayName;
    if (update.capabilities !== undefined) this.props.capabilities = update.capabilities;
    if (update.maxContextTokens !== undefined) this.props.maxContextTokens = update.maxContextTokens;
    if (update.enabledForBenchmark !== undefined) this.props.enabledForBenchmark = update.enabledForBenchmark;
    if (update.enabledForProduction !== undefined) this.props.enabledForProduction = update.enabledForProduction;
    this.props.updatedAt = occurredAt;
  }

  enable(occurredAt: Date): void {
    this.props.status = AiModelStatus.Enabled;
    this.props.updatedAt = occurredAt;
  }

  disable(occurredAt: Date): void {
    this.props.status = AiModelStatus.Disabled;
    this.props.updatedAt = occurredAt;
  }

  /** Un modèle désactivé ne doit jamais être utilisé, ni en benchmark ni en production (mission
   *  §"un modèle désactivé ne doit pas être utilisé"). */
  assertUsable(): void {
    if (this.props.status === AiModelStatus.Disabled) {
      throw new AiModelDisabledError();
    }
  }

  get id(): string {
    return this.props.id;
  }
  get provider(): string {
    return this.props.provider;
  }
  get modelKey(): string {
    return this.props.modelKey;
  }
  get displayName(): string {
    return this.props.displayName;
  }
  get status(): AiModelStatus {
    return this.props.status;
  }
  get capabilities(): AiModelCapabilities {
    return this.props.capabilities;
  }
  get maxContextTokens(): number | undefined {
    return this.props.maxContextTokens;
  }
  get enabledForBenchmark(): boolean {
    return this.props.enabledForBenchmark;
  }
  get enabledForProduction(): boolean {
    return this.props.enabledForProduction;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
