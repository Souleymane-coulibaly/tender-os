import type { Deliverable } from "../../domain/deliverable.aggregate";
import type { DeliverableType } from "../../domain/deliverable-type";

export interface DeliverableRepository {
  create(deliverable: Deliverable): Promise<void>;
  findById(input: { organizationId: string; deliverableId: string }): Promise<Deliverable | null>;
  findByTenderAndType(input: { organizationId: string; tenderId: string; type: DeliverableType }): Promise<Deliverable | null>;
  listByTender(input: { organizationId: string; tenderId: string }): Promise<readonly Deliverable[]>;
  save(deliverable: Deliverable): Promise<void>;
}

export const DELIVERABLE_REPOSITORY = Symbol("DELIVERABLE_REPOSITORY");
