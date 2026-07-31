import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { RoutingPolicyNotFoundError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toRoutingPolicySummary, type RoutingPolicySummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ROUTING_POLICY_REPOSITORY, type RoutingPolicyRepository } from "../ports/routing-policy.repository";

export type ArchiveRoutingPolicyCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  policyId: string;
  requestId?: string | undefined;
}>;

/** Archive une policy DRAFT (abandon avant activation) ou ACTIVE (désactive le routage pour cette
 *  tâche, retour au chemin legacy par variable d'environnement — voir Phase 6) — jamais une
 *  suppression, l'historique reste consultable. */
@Injectable()
export class ArchiveRoutingPolicyUseCase {
  constructor(
    @Inject(ROUTING_POLICY_REPOSITORY) private readonly routingPolicyRepository: RoutingPolicyRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ArchiveRoutingPolicyCommand): Promise<RoutingPolicySummary> {
    assertHasAiBenchmarkPermission(command.actorRole, AiBenchmarkPermission.ManageRoutingPolicies);

    const policy = await this.routingPolicyRepository.findById({ organizationId: command.organizationId, policyId: command.policyId });
    if (!policy) {
      throw new RoutingPolicyNotFoundError();
    }

    policy.archive(this.clock.now());
    await this.routingPolicyRepository.save(policy);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "routing_policy.archived",
      resourceType: "routing_policy",
      resourceId: policy.id,
      requestId: command.requestId,
    });

    return toRoutingPolicySummary(policy);
  }
}
