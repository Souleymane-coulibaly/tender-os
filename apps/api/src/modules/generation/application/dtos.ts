import type { Generation } from "../domain/generation.aggregate";
import type { PromptTemplate } from "../domain/prompt-template.aggregate";
import type { PromptVersion } from "../domain/prompt-version.entity";

export type PromptTemplateSummary = {
  id: string;
  organizationId: string;
  taskType: string;
  name: string;
  description?: string | undefined;
  outputMode: string;
  structuredSchemaKey?: string | undefined;
  archivedAt?: string | undefined;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export function toPromptTemplateSummary(template: PromptTemplate): PromptTemplateSummary {
  return {
    id: template.id,
    organizationId: template.organizationId,
    taskType: template.taskType,
    name: template.name,
    description: template.description,
    outputMode: template.outputMode,
    structuredSchemaKey: template.structuredSchemaKey,
    archivedAt: template.archivedAt?.toISOString(),
    createdBy: template.createdBy,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

export type PromptVersionSummary = {
  id: string;
  organizationId: string;
  promptTemplateId: string;
  version: number;
  status: string;
  systemPrompt: string;
  userPromptTemplate: string;
  requiredVariables: readonly string[];
  authorUserId: string;
  effectiveFrom?: string | undefined;
  archivedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export function toPromptVersionSummary(version: PromptVersion): PromptVersionSummary {
  return {
    id: version.id,
    organizationId: version.organizationId,
    promptTemplateId: version.promptTemplateId,
    version: version.version,
    status: version.status,
    systemPrompt: version.systemPrompt,
    userPromptTemplate: version.userPromptTemplate,
    requiredVariables: version.requiredVariables,
    authorUserId: version.authorUserId,
    effectiveFrom: version.effectiveFrom?.toISOString(),
    archivedAt: version.archivedAt?.toISOString(),
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString(),
  };
}

/** `canSeeCost` détermine si `estimatedCostAmount`/tokens sont inclus — calculé par le use case à
 *  partir du rôle réel de l'acteur, JAMAIS transmis par le frontend (mission §"Voir routing/cost :
 *  Selon besoin"). */
export type GenerationSummary = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  taskType: string;
  targetRef?: string | undefined;
  parentGenerationId?: string | undefined;
  rootGenerationId: string;
  version: number;
  status: string;
  promptTemplateId: string;
  promptVersionId: string;
  promptVersionNumber: number;
  routingPolicyId?: string | undefined;
  routingPolicyVersion?: number | undefined;
  /** Correctif Sprint 6 (audit Codex P1-2) — VRAIE FK Sprint 5.2, `undefined` si la génération a
   *  échoué avant qu'une décision ait pu être créée (voir `NoActiveRoutingPolicyError`). */
  routingDecisionId?: string | undefined;
  modelProvider?: string | undefined;
  modelKey?: string | undefined;
  fallbackLevel: number;
  generatedContent?: string | undefined;
  structuredContent?: unknown;
  editedContent?: string | undefined;
  editedStructuredContent?: unknown;
  editedBy?: string | undefined;
  editedAt?: string | undefined;
  inputTokenCount?: number | undefined;
  outputTokenCount?: number | undefined;
  totalTokenCount?: number | undefined;
  estimatedCostAmount?: string | undefined;
  currency?: string | undefined;
  latencyMs?: number | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  createdBy: string;
  createdAt: string;
  completedAt?: string | undefined;
  validatedBy?: string | undefined;
  validatedAt?: string | undefined;
  /** Correctif Sprint 6 (réaudit Codex P1 — "le rejet d'une génération est absent"). */
  rejectedBy?: string | undefined;
  rejectedAt?: string | undefined;
  rejectionReason?: string | undefined;
};

export function toGenerationSummary(generation: Generation, options: { canSeeCost: boolean }): GenerationSummary {
  return {
    id: generation.id,
    organizationId: generation.organizationId,
    clientAccountId: generation.clientAccountId,
    tenderId: generation.tenderId,
    taskType: generation.taskType,
    targetRef: generation.targetRef,
    parentGenerationId: generation.parentGenerationId,
    rootGenerationId: generation.rootGenerationId,
    version: generation.version,
    status: generation.status,
    promptTemplateId: generation.promptTemplateId,
    promptVersionId: generation.promptVersionId,
    promptVersionNumber: generation.promptVersionNumber,
    routingPolicyId: generation.routingPolicyId,
    routingPolicyVersion: generation.routingPolicyVersion,
    routingDecisionId: generation.routingDecisionId,
    modelProvider: generation.modelProvider,
    modelKey: generation.modelKey,
    fallbackLevel: generation.fallbackLevel,
    generatedContent: generation.generatedContent,
    structuredContent: generation.structuredContent,
    editedContent: generation.editedContent,
    editedStructuredContent: generation.editedStructuredContent,
    editedBy: generation.editedBy,
    editedAt: generation.editedAt?.toISOString(),
    inputTokenCount: options.canSeeCost ? generation.inputTokenCount : undefined,
    outputTokenCount: options.canSeeCost ? generation.outputTokenCount : undefined,
    totalTokenCount: options.canSeeCost ? generation.totalTokenCount : undefined,
    estimatedCostAmount: options.canSeeCost ? generation.estimatedCostAmount : undefined,
    currency: options.canSeeCost ? generation.currency : undefined,
    latencyMs: generation.latencyMs,
    errorCode: generation.errorCode,
    errorMessage: generation.errorMessage,
    createdBy: generation.createdBy,
    createdAt: generation.createdAt.toISOString(),
    completedAt: generation.completedAt?.toISOString(),
    validatedBy: generation.validatedBy,
    validatedAt: generation.validatedAt?.toISOString(),
    rejectedBy: generation.rejectedBy,
    rejectedAt: generation.rejectedAt?.toISOString(),
    rejectionReason: generation.rejectionReason,
  };
}
