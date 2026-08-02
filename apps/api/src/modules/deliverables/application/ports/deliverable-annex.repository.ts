import type { DeliverableAnnex } from "../../domain/deliverable-annex.aggregate";

export interface DeliverableAnnexRepository {
  create(annex: DeliverableAnnex): Promise<void>;
  findById(input: { organizationId: string; annexId: string }): Promise<DeliverableAnnex | null>;
  listByDeliverable(input: { organizationId: string; deliverableId: string }): Promise<readonly DeliverableAnnex[]>;
  save(annex: DeliverableAnnex): Promise<void>;
}

export const DELIVERABLE_ANNEX_REPOSITORY = Symbol("DELIVERABLE_ANNEX_REPOSITORY");
