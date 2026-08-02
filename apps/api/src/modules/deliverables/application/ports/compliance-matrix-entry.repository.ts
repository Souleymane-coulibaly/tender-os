import type { ComplianceMatrixEntry } from "../../domain/compliance-matrix-entry.aggregate";

export interface ComplianceMatrixEntryRepository {
  create(entry: ComplianceMatrixEntry): Promise<void>;
  findById(input: { organizationId: string; entryId: string }): Promise<ComplianceMatrixEntry | null>;
  listByDeliverable(input: { organizationId: string; deliverableId: string }): Promise<readonly ComplianceMatrixEntry[]>;
  save(entry: ComplianceMatrixEntry): Promise<void>;
}

export const COMPLIANCE_MATRIX_ENTRY_REPOSITORY = Symbol("COMPLIANCE_MATRIX_ENTRY_REPOSITORY");
