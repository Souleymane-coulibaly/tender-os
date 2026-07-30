import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { AnalysisJob } from "../../domain/analysis-job.aggregate";
import { AnalysisScope } from "../../domain/analysis-scope";
import { AnalysisNotFoundError, AnalysisPermissionMissingError } from "../../domain/errors";
import { InMemoryAnalysisJobRepository } from "../../test-support/fakes";
import { GetAnalysisUseCase } from "./get-analysis.use-case";

const ORG = randomUUID();
const OTHER_ORG = randomUUID();
const NOW = new Date("2026-07-29T14:00:00Z");

describe("GetAnalysisUseCase", () => {
  let jobRepository: InMemoryAnalysisJobRepository;
  let jobId: string;

  beforeEach(async () => {
    jobRepository = new InMemoryAnalysisJobRepository();
    const job = AnalysisJob.create({
      id: randomUUID(),
      organizationId: ORG,
      tenderId: randomUUID(),
      scope: AnalysisScope.Tender,
      analysisVersion: 1,
      promptVersion: 1,
      occurredAt: NOW,
    });
    jobId = job.id;
    await jobRepository.save(job);
  });

  it("returns the job for the owning organization", async () => {
    const useCase = new GetAnalysisUseCase(jobRepository);
    const result = await useCase.execute({ organizationId: ORG, jobId, actorRole: "READ_ONLY" });
    expect(result.id).toBe(jobId);
  });

  it("never leaks a job belonging to another organization", async () => {
    const useCase = new GetAnalysisUseCase(jobRepository);
    await expect(useCase.execute({ organizationId: OTHER_ORG, jobId, actorRole: "READ_ONLY" })).rejects.toBeInstanceOf(
      AnalysisNotFoundError,
    );
  });

  it("rejects a role without Read permission", async () => {
    // Toutes les valeurs de ROLE_ANALYSIS_PERMISSIONS incluent Read ; un rôle absent de la
    // matrice (donc sans aucune permission) doit être rejeté.
    const useCase = new GetAnalysisUseCase(jobRepository);
    await expect(useCase.execute({ organizationId: ORG, jobId, actorRole: "UNKNOWN_ROLE" })).rejects.toBeInstanceOf(
      AnalysisPermissionMissingError,
    );
  });

  it("throws ANALYSIS_NOT_FOUND for an unknown id", async () => {
    const useCase = new GetAnalysisUseCase(jobRepository);
    await expect(useCase.execute({ organizationId: ORG, jobId: randomUUID(), actorRole: "READ_ONLY" })).rejects.toBeInstanceOf(
      AnalysisNotFoundError,
    );
  });
});
