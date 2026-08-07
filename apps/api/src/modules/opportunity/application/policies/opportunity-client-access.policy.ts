import type { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import type { Opportunity } from "../../domain/opportunity.aggregate";

/**
 * Vérification client-tier CONDITIONNELLE — `Opportunity.clientAccountId` reste nullable tout au
 * long du cycle de vie (mission §23), donc le double contrôle (rôle-tier + client-tier, même motif
 * que `assertTenderMutationAllowed` côté Tenders) ne s'applique QU'UNE FOIS le candidat résolu.
 * Avant cela, seule la permission `OpportunityPermission` (rôle-tier) protège l'accès — jamais un
 * contournement, simplement une couche de contrôle qui n'a pas encore de cible à vérifier.
 */
export async function assertOpportunityClientAccessAllowed(
  opportunity: Opportunity,
  assertClientAccessUseCase: AssertClientAccessUseCase,
  input: { organizationId: string; actorId: string; actorRole: string; permission: ClientPermission },
): Promise<void> {
  if (opportunity.clientAccountId === undefined) {
    return;
  }
  await assertClientAccessUseCase.execute({
    organizationId: input.organizationId,
    clientAccountId: opportunity.clientAccountId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    permission: input.permission,
  });
}
