import type { Consortium } from "../../domain/consortium.aggregate";

export interface ConsortiumRepository {
  create(consortium: Consortium): Promise<void>;
  findById(input: { organizationId: string; consortiumId: string }): Promise<Consortium | null>;
  findByTenderId(input: { organizationId: string; tenderId: string }): Promise<Consortium | null>;
  save(consortium: Consortium): Promise<void>;
}

export const CONSORTIUM_REPOSITORY = Symbol("CONSORTIUM_REPOSITORY");
