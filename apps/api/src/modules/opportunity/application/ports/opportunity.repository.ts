import type { Opportunity } from "../../domain/opportunity.aggregate";
import type { OpportunityStatus } from "../../domain/opportunity-status";

export type OpportunityPage = { items: Opportunity[]; nextCursor: string | null };

export type OpportunityListFilter = Readonly<{
  organizationId: string;
  status?: OpportunityStatus | undefined;
  clientAccountId?: string | undefined;
  /** Restriction automatique calculée par `ListAccessibleClientsUseCase` — jamais fournie par le
   *  client (même motif que `TenderListFilter.restrictToClientAccountIds`). `undefined` = aucune
   *  restriction (OWNER/ADMIN) ; un tableau (même vide) restreint strictement. Une Opportunity sans
   *  `clientAccountId` reste toujours visible (mission §23 "permettre quand même une décision
   *  humaine" malgré des données manquantes) — jamais masquée par cette restriction. */
  restrictToClientAccountIds?: readonly string[] | undefined;
}>;

export interface OpportunityRepository {
  findById(input: { organizationId: string; opportunityId: string }): Promise<Opportunity | null>;
  list(
    input: OpportunityListFilter & {
      cursor?: string | undefined;
      limit: number;
      sort?: "createdAt" | "submissionDeadline" | "title" | "updatedAt" | undefined;
      sortDirection?: "asc" | "desc" | undefined;
    },
  ): Promise<OpportunityPage>;
  save(opportunity: Opportunity): Promise<void>;
  /** Réservation atomique compare-and-set (mission §19, idempotence de la promotion) — même motif
   *  que `AiSuggestionRepository.transitionFromPending`. `null` si l'Opportunity n'était plus dans
   *  un des `fromStatuses` attendus au moment de l'appel (déjà promue, ou statut incompatible) ;
   *  l'appelant (`PromoteOpportunityToTenderUseCase`) distingue ensuite ces deux cas en relisant
   *  l'enregistrement. Rejoint la transaction ambiante active si présente (voir
   *  `PrismaService.currentClient()`), jamais une transaction imbriquée indépendante. */
  transitionToPromoted(input: {
    organizationId: string;
    opportunityId: string;
    fromStatuses: readonly OpportunityStatus[];
    tenderId: string;
    updatedAt: Date;
  }): Promise<Opportunity | null>;
}

export const OPPORTUNITY_REPOSITORY = Symbol("OPPORTUNITY_REPOSITORY");
