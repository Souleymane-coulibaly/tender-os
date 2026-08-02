import type { ValidationIssue } from "../../domain/validation-issue";
import type { ValidationRun } from "../../domain/validation-run.aggregate";

/**
 * Mission Sprint 8A §8/§26 — `ValidationRun.issues` (getter du domaine) porte déjà la liste
 * complète : jamais un second tableau redondant à maintenir en synchronisation ici.
 */
export interface ValidationRunRepository {
  create(input: { run: ValidationRun; issues: readonly ValidationIssue[] }): Promise<void>;
  findById(input: { organizationId: string; validationRunId: string }): Promise<ValidationRun | null>;
  findLatestForExportJob(input: { organizationId: string; exportJobId: string }): Promise<ValidationRun | null>;
  list(input: { organizationId: string; tenderId: string; limit: number; offset: number }): Promise<{ items: readonly ValidationRun[]; total: number }>;
  findIssueById(input: { organizationId: string; issueId: string }): Promise<ValidationIssue | null>;
  saveIssue(issue: ValidationIssue): Promise<void>;
}

export const VALIDATION_RUN_REPOSITORY = Symbol("VALIDATION_RUN_REPOSITORY");
