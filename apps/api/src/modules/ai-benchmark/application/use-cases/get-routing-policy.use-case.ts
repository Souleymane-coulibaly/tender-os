import { Inject, Injectable } from "@nestjs/common";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { RoutingPolicyNotFoundError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toRoutingPolicySummary, type RoutingPolicySummary } from "../dtos";
import { ROUTING_POLICY_REPOSITORY, type RoutingPolicyRepository } from "../ports/routing-policy.repository";

export type GetRoutingPolicyQuery = Readonly<{ organizationId: string; actorRole: string; policyId: string }>;

@Injectable()
export class GetRoutingPolicyUseCase {
  constructor(@Inject(ROUTING_POLICY_REPOSITORY) private readonly routingPolicyRepository: RoutingPolicyRepository) {}

  async execute(query: GetRoutingPolicyQuery): Promise<RoutingPolicySummary> {
    assertHasAiBenchmarkPermission(query.actorRole, AiBenchmarkPermission.ReadRoutingPolicies);

    const policy = await this.routingPolicyRepository.findById({ organizationId: query.organizationId, policyId: query.policyId });
    if (!policy) {
      throw new RoutingPolicyNotFoundError();
    }

    return toRoutingPolicySummary(policy);
  }
}
