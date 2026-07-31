import type { PromptKey } from "../../analysis";
import { ModelRecommendationStatus } from "./model-recommendation-status";
import { ModelRecommendationNotDraftError } from "./errors";

export type ModelRecommendationProps = {
  id: string;
  organizationId: string;
  promptKey: PromptKey;
  runId: string;
  primaryAiModelId: string;
  escalationAiModelId?: string | undefined;
  score: number;
  avgCostAmount: string;
  avgCostCurrency: string;
  avgLatencyMs: number;
  confidence: number;
  reasons: readonly string[];
  limitations: readonly string[];
  status: ModelRecommendationStatus;
  generatedAt: Date;
  decidedByUserId?: string | undefined;
  decidedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Recommandation de modèle par tâche IA (Sprint 5.2 §"Recommandations") — JAMAIS mise en
 * production automatiquement (mission §"Ne mets pas automatiquement la recommandation en
 * production" / "Ne déploie pas automatiquement en production un modèle gagnant sans mécanisme de
 * validation explicite") : reste DRAFT jusqu'à une décision explicite d'un OWNER/ORGANIZATION_ADMIN
 * (`approve()`/`reject()`), jamais une transition automatique.
 */
export class ModelRecommendation {
  private constructor(private props: ModelRecommendationProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    promptKey: PromptKey;
    runId: string;
    primaryAiModelId: string;
    escalationAiModelId?: string | undefined;
    score: number;
    avgCostAmount: string;
    avgCostCurrency: string;
    avgLatencyMs: number;
    confidence: number;
    reasons: readonly string[];
    limitations: readonly string[];
    occurredAt: Date;
  }): ModelRecommendation {
    return new ModelRecommendation({
      id: input.id,
      organizationId: input.organizationId,
      promptKey: input.promptKey,
      runId: input.runId,
      primaryAiModelId: input.primaryAiModelId,
      escalationAiModelId: input.escalationAiModelId,
      score: input.score,
      avgCostAmount: input.avgCostAmount,
      avgCostCurrency: input.avgCostCurrency,
      avgLatencyMs: input.avgLatencyMs,
      confidence: input.confidence,
      reasons: input.reasons,
      limitations: input.limitations,
      status: ModelRecommendationStatus.Draft,
      generatedAt: input.occurredAt,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: ModelRecommendationProps): ModelRecommendation {
    return new ModelRecommendation(props);
  }

  private assertDraft(): void {
    if (this.props.status !== ModelRecommendationStatus.Draft) {
      throw new ModelRecommendationNotDraftError();
    }
  }

  approve(decidedByUserId: string, occurredAt: Date): void {
    this.assertDraft();
    this.props.status = ModelRecommendationStatus.Approved;
    this.props.decidedByUserId = decidedByUserId;
    this.props.decidedAt = occurredAt;
    this.props.updatedAt = occurredAt;
  }

  reject(decidedByUserId: string, occurredAt: Date): void {
    this.assertDraft();
    this.props.status = ModelRecommendationStatus.Rejected;
    this.props.decidedByUserId = decidedByUserId;
    this.props.decidedAt = occurredAt;
    this.props.updatedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get promptKey(): PromptKey {
    return this.props.promptKey;
  }
  get runId(): string {
    return this.props.runId;
  }
  get primaryAiModelId(): string {
    return this.props.primaryAiModelId;
  }
  get escalationAiModelId(): string | undefined {
    return this.props.escalationAiModelId;
  }
  get score(): number {
    return this.props.score;
  }
  get avgCostAmount(): string {
    return this.props.avgCostAmount;
  }
  get avgCostCurrency(): string {
    return this.props.avgCostCurrency;
  }
  get avgLatencyMs(): number {
    return this.props.avgLatencyMs;
  }
  get confidence(): number {
    return this.props.confidence;
  }
  get reasons(): readonly string[] {
    return this.props.reasons;
  }
  get limitations(): readonly string[] {
    return this.props.limitations;
  }
  get status(): ModelRecommendationStatus {
    return this.props.status;
  }
  get generatedAt(): Date {
    return this.props.generatedAt;
  }
  get decidedByUserId(): string | undefined {
    return this.props.decidedByUserId;
  }
  get decidedAt(): Date | undefined {
    return this.props.decidedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
