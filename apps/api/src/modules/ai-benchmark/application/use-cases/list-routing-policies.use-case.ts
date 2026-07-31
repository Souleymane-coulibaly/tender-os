import { Inject, Injectable } from "@nestjs/common";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toRoutingPolicySummary, type RoutingPolicySummary } from "../dtos";
import { ROUTING_POLICY_REPOSITORY, type RoutingPolicyRepository } from "../ports/routing-policy.repository";

export type ListRoutingPoliciesQuery = Readonly<{ organizationId: string; actorRole: string }>;

@Injectable()
export class ListRoutingPoliciesUseCase {
  constructor(@Inject(ROUTING_POLICY_REPOSITORY) private readonly routingPolicyRepository: RoutingPolicyRepository) {}

  async execute(query: ListRoutingPoliciesQuery): Promise<readonly RoutingPolicySummary[]> {
    assertHasAiBenchmarkPermission(query.actorRole, AiBenchmarkPermission.ReadRoutingPolicies);
    const policies = await this.routingPolicyRepository.list({ organizationId: query.organizationId });
    return policies.map(toRoutingPolicySummary);
  }
}
