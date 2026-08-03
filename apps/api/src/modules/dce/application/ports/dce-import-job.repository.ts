import type { DceImportJob } from "../../domain/dce-import-job.aggregate";

export interface DceImportJobRepository {
  findById(input: { organizationId: string; jobId: string }): Promise<DceImportJob | null>;
  create(job: DceImportJob): Promise<void>;
  save(job: DceImportJob): Promise<void>;
}

export const DCE_IMPORT_JOB_REPOSITORY = Symbol("DCE_IMPORT_JOB_REPOSITORY");
