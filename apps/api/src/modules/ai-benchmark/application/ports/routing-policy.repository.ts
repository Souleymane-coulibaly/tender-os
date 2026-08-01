import type { RoutingPolicy } from "../../domain/routing-policy.aggregate";

export interface RoutingPolicyRepository {
  findById(input: { organizationId: string; policyId: string }): Promise<RoutingPolicy | null>;
  /** `promptKey` est un identifiant de tâche routable brut (Analysis ou Generation, voir
   *  `RoutingPolicy.promptKey`) — jamais un type fermé importé d'un module consommateur ici. */
  findActive(input: { organizationId: string; promptKey: string }): Promise<RoutingPolicy | null>;
  findLatestVersion(input: { organizationId: string; promptKey: string }): Promise<RoutingPolicy | null>;
  list(input: { organizationId: string }): Promise<readonly RoutingPolicy[]>;
  create(policy: RoutingPolicy): Promise<void>;
  save(policy: RoutingPolicy): Promise<void>;
  /** Archive l'éventuelle version ACTIVE existante pour ce (organizationId, promptKey) puis active
   *  `policy`, dans une transaction courte unique — jamais deux versions ACTIVE visibles, même
   *  transitoirement (mission §"aucune période avec deux versions actives incohérentes"). */
  activateAtomically(policy: RoutingPolicy): Promise<void>;
}

export const ROUTING_POLICY_REPOSITORY = Symbol("ROUTING_POLICY_REPOSITORY");
