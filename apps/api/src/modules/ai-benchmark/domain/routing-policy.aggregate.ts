import type { EscalationCondition } from "../../analysis";
import { ALLOWED_ROUTING_POLICY_TRANSITIONS, RoutingPolicyStatus } from "./routing-policy-status";
import { InvalidRoutingPolicyStatusTransitionError } from "./errors";

export type RoutingPolicyProps = {
  id: string;
  organizationId: string;
  /** Identifiant de tâche routable — Analysis (`PromptKey`, 2 valeurs historiques) ou Generation
   *  (`GenerationTaskType`, Sprint 6). Volontairement un `string` brut, jamais un import du type
   *  fermé d'un module consommateur : ai-benchmark ne doit dépendre ni d'Analysis ni de Generation
   *  pour cette valeur, seule la couche HTTP (`ROUTABLE_TASK_KEYS`) contrôle les valeurs acceptées à
   *  la création (voir rapport correctif Sprint 6 §Routing). */
  promptKey: string;
  version: number;
  status: RoutingPolicyStatus;
  primaryAiModelId: string;
  escalationAiModelId?: string | undefined;
  confidenceThreshold?: number | undefined;
  provenanceRequired: boolean;
  timeoutMs: number;
  maxRetries: number;
  escalationConditions: readonly EscalationCondition[];
  sourceRecommendationId?: string | undefined;
  authorUserId: string;
  effectiveFrom?: Date | undefined;
  archivedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Politique de routage versionnée par (organisation, tâche IA) — Sprint 5.2 §"Routing Policy".
 * Créée DRAFT, jamais active d'emblée (mission §"Prévoir une action explicite d'approbation"). Au
 * plus UNE version ACTIVE par (organizationId, promptKey) à tout instant — garanti par un index
 * unique partiel côté Prisma ; `activate()` ne fait ici que la moitié applicative de cette
 * invariante (l'autre moitié, l'archivage atomique de l'éventuelle version ACTIVE précédente, vit
 * dans `RoutingPolicyRepository.activateAtomically`, dans la même transaction courte).
 */
export class RoutingPolicy {
  private constructor(private props: RoutingPolicyProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    promptKey: string;
    version: number;
    primaryAiModelId: string;
    escalationAiModelId?: string | undefined;
    confidenceThreshold?: number | undefined;
    provenanceRequired?: boolean | undefined;
    timeoutMs: number;
    maxRetries: number;
    escalationConditions: readonly EscalationCondition[];
    sourceRecommendationId?: string | undefined;
    authorUserId: string;
    occurredAt: Date;
  }): RoutingPolicy {
    return new RoutingPolicy({
      id: input.id,
      organizationId: input.organizationId,
      promptKey: input.promptKey,
      version: input.version,
      status: RoutingPolicyStatus.Draft,
      primaryAiModelId: input.primaryAiModelId,
      escalationAiModelId: input.escalationAiModelId,
      confidenceThreshold: input.confidenceThreshold,
      provenanceRequired: input.provenanceRequired ?? true,
      timeoutMs: input.timeoutMs,
      maxRetries: input.maxRetries,
      escalationConditions: input.escalationConditions,
      sourceRecommendationId: input.sourceRecommendationId,
      authorUserId: input.authorUserId,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: RoutingPolicyProps): RoutingPolicy {
    return new RoutingPolicy(props);
  }

  private transitionTo(next: RoutingPolicyStatus, occurredAt: Date): void {
    const allowed = ALLOWED_ROUTING_POLICY_TRANSITIONS[this.props.status];
    if (!allowed.includes(next)) {
      throw new InvalidRoutingPolicyStatusTransitionError({ from: this.props.status, to: next });
    }
    this.props.status = next;
    this.props.updatedAt = occurredAt;
  }

  activate(occurredAt: Date): void {
    this.transitionTo(RoutingPolicyStatus.Active, occurredAt);
    this.props.effectiveFrom = occurredAt;
  }

  archive(occurredAt: Date): void {
    this.transitionTo(RoutingPolicyStatus.Archived, occurredAt);
    this.props.archivedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get promptKey(): string {
    return this.props.promptKey;
  }
  get version(): number {
    return this.props.version;
  }
  get status(): RoutingPolicyStatus {
    return this.props.status;
  }
  get primaryAiModelId(): string {
    return this.props.primaryAiModelId;
  }
  get escalationAiModelId(): string | undefined {
    return this.props.escalationAiModelId;
  }
  get confidenceThreshold(): number | undefined {
    return this.props.confidenceThreshold;
  }
  get provenanceRequired(): boolean {
    return this.props.provenanceRequired;
  }
  get timeoutMs(): number {
    return this.props.timeoutMs;
  }
  get maxRetries(): number {
    return this.props.maxRetries;
  }
  get escalationConditions(): readonly EscalationCondition[] {
    return this.props.escalationConditions;
  }
  get sourceRecommendationId(): string | undefined {
    return this.props.sourceRecommendationId;
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
