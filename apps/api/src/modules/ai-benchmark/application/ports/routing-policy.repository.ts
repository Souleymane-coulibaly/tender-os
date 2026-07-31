import type { RoutingPolicy } from "../../domain/routing-policy.aggregate";
import type { PromptKey } from "../../../analysis";

export interface RoutingPolicyRepository {
  findById(input: { organizationId: string; policyId: string }): Promise<RoutingPolicy | null>;
  findActive(input: { organizationId: string; promptKey: PromptKey }): Promise<RoutingPolicy | null>;
  findLatestVersion(input: { organizationId: string; promptKey: PromptKey }): Promise<RoutingPolicy | null>;
  list(input: { organizationId: string }): Promise<readonly RoutingPolicy[]>;
  create(policy: RoutingPolicy): Promise<void>;
  save(policy: RoutingPolicy): Promise<void>;
  /** Archive l'éventuelle version ACTIVE existante pour ce (organizationId, promptKey) puis active
   *  `policy`, dans une transaction courte unique — jamais deux versions ACTIVE visibles, même
   *  transitoirement (mission §"aucune période avec deux versions actives incohérentes"). */
  activateAtomically(policy: RoutingPolicy): Promise<void>;
}

export const ROUTING_POLICY_REPOSITORY = Symbol("ROUTING_POLICY_REPOSITORY");
