import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AiModelStatus } from "../../domain/ai-model-status";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { RoutingPolicyModelNotEligibleError, RoutingPolicyNotFoundError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toRoutingPolicySummary, type RoutingPolicySummary } from "../dtos";
import { AI_MODEL_REPOSITORY, type AiModelRepository } from "../ports/ai-model.repository";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ROUTING_POLICY_REPOSITORY, type RoutingPolicyRepository } from "../ports/routing-policy.repository";

export type ActivateRoutingPolicyCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  policyId: string;
  requestId?: string | undefined;
}>;

/** Activation atomique (Sprint 5.2 §"une seule version active par scope/tâche") — délègue
 *  l'archivage de l'éventuelle version ACTIVE précédente + l'activation de celle-ci à
 *  `RoutingPolicyRepository.activateAtomically`, une transaction courte unique côté Prisma, protégée
 *  par l'index unique partiel `WHERE status = 'ACTIVE'` (audit Codex P1-1) — une activation
 *  concurrente perdante reçoit `RoutingPolicyActivationConflictError`, jamais une fenêtre où deux
 *  versions sont visibles ACTIVE simultanément. Audit Codex P1-1 : refuse également l'activation si
 *  le modèle principal ou d'escalade a été désactivé/retiré de la production entre la création de
 *  la policy (DRAFT) et cette activation. */
@Injectable()
export class ActivateRoutingPolicyUseCase {
  constructor(
    @Inject(ROUTING_POLICY_REPOSITORY) private readonly routingPolicyRepository: RoutingPolicyRepository,
    @Inject(AI_MODEL_REPOSITORY) private readonly aiModelRepository: AiModelRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ActivateRoutingPolicyCommand): Promise<RoutingPolicySummary> {
    assertHasAiBenchmarkPermission(command.actorRole, AiBenchmarkPermission.ManageRoutingPolicies);

    const policy = await this.routingPolicyRepository.findById({ organizationId: command.organizationId, policyId: command.policyId });
    if (!policy) {
      throw new RoutingPolicyNotFoundError();
    }

    for (const modelId of [policy.primaryAiModelId, policy.escalationAiModelId].filter((id): id is string => id !== undefined)) {
      const model = await this.aiModelRepository.findById({ id: modelId });
      if (!model || model.status !== AiModelStatus.Enabled || !model.enabledForProduction) {
        throw new RoutingPolicyModelNotEligibleError({ modelId });
      }
    }

    policy.activate(this.clock.now());
    await this.routingPolicyRepository.activateAtomically(policy);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "routing_policy.activated",
      resourceType: "routing_policy",
      resourceId: policy.id,
      requestId: command.requestId,
      metadata: { promptKey: policy.promptKey, version: policy.version },
    });

    return toRoutingPolicySummary(policy);
  }
}
