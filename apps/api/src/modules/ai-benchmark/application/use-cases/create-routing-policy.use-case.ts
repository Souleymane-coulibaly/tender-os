import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import type { EscalationCondition, PromptKey } from "../../../analysis";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { RoutingPolicy } from "../../domain/routing-policy.aggregate";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toRoutingPolicySummary, type RoutingPolicySummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ROUTING_POLICY_REPOSITORY, type RoutingPolicyRepository } from "../ports/routing-policy.repository";

export type CreateRoutingPolicyCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  promptKey: PromptKey;
  primaryAiModelId: string;
  escalationAiModelId?: string | undefined;
  confidenceThreshold?: number | undefined;
  provenanceRequired?: boolean | undefined;
  timeoutMs: number;
  maxRetries: number;
  escalationConditions: readonly EscalationCondition[];
  sourceRecommendationId?: string | undefined;
  requestId?: string | undefined;
}>;

/** Crée une nouvelle version DRAFT (Sprint 5.2 §"Routing Policy") — version auto-incrémentée par
 *  (organisation, tâche IA), jamais active d'emblée : une activation explicite est toujours
 *  requise ensuite (`ActivateRoutingPolicyUseCase`). */
@Injectable()
export class CreateRoutingPolicyUseCase {
  constructor(
    @Inject(ROUTING_POLICY_REPOSITORY) private readonly routingPolicyRepository: RoutingPolicyRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateRoutingPolicyCommand): Promise<RoutingPolicySummary> {
    assertHasAiBenchmarkPermission(command.actorRole, AiBenchmarkPermission.ManageRoutingPolicies);

    const latest = await this.routingPolicyRepository.findLatestVersion({
      organizationId: command.organizationId,
      promptKey: command.promptKey,
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    const policy = RoutingPolicy.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      promptKey: command.promptKey,
      version: nextVersion,
      primaryAiModelId: command.primaryAiModelId,
      escalationAiModelId: command.escalationAiModelId,
      confidenceThreshold: command.confidenceThreshold,
      provenanceRequired: command.provenanceRequired,
      timeoutMs: command.timeoutMs,
      maxRetries: command.maxRetries,
      escalationConditions: command.escalationConditions,
      sourceRecommendationId: command.sourceRecommendationId,
      authorUserId: command.actorId,
      occurredAt: this.clock.now(),
    });

    await this.routingPolicyRepository.create(policy);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "routing_policy.created",
      resourceType: "routing_policy",
      resourceId: policy.id,
      requestId: command.requestId,
      metadata: { promptKey: policy.promptKey, version: policy.version },
    });

    return toRoutingPolicySummary(policy);
  }
}
