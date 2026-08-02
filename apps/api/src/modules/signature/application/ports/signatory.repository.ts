import type { Signatory } from "../../domain/signatory";

export interface SignatoryRepository {
  create(signatory: Signatory): Promise<void>;
  findById(input: { organizationId: string; signatoryId: string }): Promise<Signatory | null>;
  listForTender(input: { organizationId: string; tenderId: string }): Promise<readonly Signatory[]>;
  save(signatory: Signatory): Promise<void>;
}

export const SIGNATORY_REPOSITORY = Symbol("SIGNATORY_REPOSITORY");
