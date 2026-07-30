import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { AnalysisJob } from "../domain/analysis-job.aggregate";
import { AnalysisScope } from "../domain/analysis-scope";
import { AnalysisStatus } from "../domain/analysis-status";
import { PrismaAnalysisJobRepository } from "./prisma-analysis-job.repository";

/**
 * Preuve réelle contre PostgreSQL (mission Sprint 4.1, même motif que
 * PrismaDocumentExtractionRepository.integration.spec.ts, module Extraction) — les tests unitaires
 * avec fakes en mémoire ne suffisent pas à démontrer l'absence de race condition ni le respect des
 * contraintes CHECK/uniques : seul un vrai moteur transactionnel peut le faire.
 *
 * Chaque test qui a besoin d'un job "propre" crée son propre Tender dédié (`createTender()`) —
 * jamais un `tenderId` partagé entre tests pour une même cible/version, afin de ne jamais heurter
 * la contrainte unique (organization_id, scope, target_id, analysis_version) d'un test à l'autre.
 */
describe("PrismaAnalysisJobRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaAnalysisJobRepository(prisma);

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const actorId = randomUUID();
  const createdTenderIds: string[] = [];
  let clientAccountId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "AnalysisJob Repository Integration Test Org",
        slug: `analysis-job-repo-integration-test-org-${organizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
    await prisma.organization.create({
      data: {
        id: otherOrganizationId,
        name: "AnalysisJob Repository Integration Test Org (other)",
        slug: `analysis-job-repo-integration-test-org-other-${otherOrganizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
    clientAccountId = (
      await prisma.clientAccount.create({
        data: {
          id: randomUUID(),
          organizationId,
          name: "Client de test",
          nameNormalized: "client de test",
          status: "ACTIVE",
          createdBy: actorId,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.analysisAttempt.deleteMany({ where: { organizationId } });
    await prisma.analysisJob.deleteMany({ where: { organizationId } });
    if (createdTenderIds.length > 0) {
      await prisma.tender.deleteMany({ where: { id: { in: createdTenderIds } } });
    }
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  });

  async function createTender(): Promise<string> {
    const id = randomUUID();
    createdTenderIds.push(id);
    await prisma.tender.create({
      data: { id, organizationId, clientAccountId, title: "Marché pour tests AnalysisJob", status: "DRAFT", tags: [], createdBy: actorId },
    });
    return id;
  }

  /** Crée et persiste un job QUEUED tout neuf, sur un Tender dédié — jamais partagé avec un autre
   *  test, pour ne jamais entrer en collision avec la contrainte unique de version. */
  async function seedQueuedJob(): Promise<{ jobId: string; tenderId: string }> {
    const tenderId = await createTender();
    const job = AnalysisJob.create({
      id: randomUUID(),
      organizationId,
      tenderId,
      scope: AnalysisScope.Tender,
      analysisVersion: 1,
      promptVersion: 1,
      occurredAt: new Date(),
    });
    job.queue(new Date());
    await repository.runExclusiveForTarget({
      organizationId,
      scope: AnalysisScope.Tender,
      targetId: tenderId,
      fn: async (context) => context.create(job),
    });
    return { jobId: job.id, tenderId };
  }

  describe("reserveForProcessing", () => {
    it("lets exactly one of two concurrent reservations for the same job succeed", async () => {
      const { jobId } = await seedQueuedJob();

      const results = await Promise.all([
        repository.reserveForProcessing({ organizationId, jobId, occurredAt: new Date() }),
        repository.reserveForProcessing({ organizationId, jobId, occurredAt: new Date() }),
      ]);

      expect(results.filter((r) => r.kind === "reserved")).toHaveLength(1);
      expect(results.filter((r) => r.kind === "not_startable")).toHaveLength(1);

      const job = await repository.findById({ organizationId, jobId });
      expect(job?.status).toBe(AnalysisStatus.Processing);
      expect(job?.attemptCount).toBe(1);
    });

    it("returns not_startable (never throws) once the job is already PROCESSING", async () => {
      const { jobId } = await seedQueuedJob();
      await repository.reserveForProcessing({ organizationId, jobId, occurredAt: new Date() });

      const second = await repository.reserveForProcessing({ organizationId, jobId, occurredAt: new Date() });
      expect(second).toEqual({ kind: "not_startable", status: AnalysisStatus.Processing });
    });
  });

  describe("finalizeAttempt", () => {
    it("discards a finalization whose expectedAttemptCount is stale, never overwriting the current row", async () => {
      const { jobId } = await seedQueuedJob();
      await repository.reserveForProcessing({ organizationId, jobId, occurredAt: new Date() });

      const result = await repository.finalizeAttempt({
        organizationId,
        jobId,
        expectedAttemptCount: 999,
        startedAt: new Date(),
        occurredAt: new Date(),
        outcome: { kind: "failed", errorCode: "AI_TIMEOUT", errorMessage: "boom" },
        trigger: "MANUAL",
        retryCount: 0,
      });

      expect(result.applied).toBe(false);
      const job = await repository.findById({ organizationId, jobId });
      expect(job?.status).toBe(AnalysisStatus.Processing);
      // Correction P1-02 — une finalisation obsolète n'écrit ni le job ni l'historique.
      const attempts = await prisma.analysisAttempt.findMany({ where: { jobId } });
      expect(attempts).toHaveLength(0);
    });

    it("persists the technical result (tokens, summary, provider/model) atomically on success", async () => {
      const { jobId } = await seedQueuedJob();
      const reservation = await repository.reserveForProcessing({ organizationId, jobId, occurredAt: new Date() });
      expect(reservation.kind).toBe("reserved");

      const startedAt = new Date();
      const result = await repository.finalizeAttempt({
        organizationId,
        jobId,
        expectedAttemptCount: 1,
        startedAt,
        occurredAt: new Date(),
        outcome: {
          kind: "succeeded",
          provider: "FAKE",
          model: "fake-model",
          durationMs: 123,
          inputTokenCount: 10,
          outputTokenCount: 5,
          totalTokenCount: 15,
          resultSummary: "ok",
        },
        trigger: "MANUAL",
        retryCount: 0,
      });

      expect(result.applied).toBe(true);
      const job = await repository.findById({ organizationId, jobId });
      expect(job?.status).toBe(AnalysisStatus.Succeeded);
      expect(job?.totalTokenCount).toBe(15);
      expect(job?.resultSummary).toBe("ok");

      // Correction P1-02 — la ligne AnalysisAttempt existe, atomique avec l'état terminal du job.
      const attempts = await prisma.analysisAttempt.findMany({ where: { jobId } });
      expect(attempts).toHaveLength(1);
      expect(attempts[0]!.outcome).toBe("SUCCEEDED");
      expect(attempts[0]!.attemptNumber).toBe(1);
      expect(attempts[0]!.trigger).toBe("MANUAL");
    });
  });

  describe("runExclusiveForTarget — double trigger / versioning", () => {
    it("serializes concurrent 'create version 1' attempts so only one job is created for the same target", async () => {
      const targetTenderId = await createTender();

      async function attemptCreate(): Promise<"created" | "already_running"> {
        return repository.runExclusiveForTarget({
          organizationId,
          scope: AnalysisScope.Tender,
          targetId: targetTenderId,
          fn: async (context) => {
            const active = await context.findActiveByTarget({ organizationId, scope: AnalysisScope.Tender, targetId: targetTenderId });
            if (active) return "already_running";
            const version = await context.getNextVersion({ organizationId, scope: AnalysisScope.Tender, targetId: targetTenderId });
            const job = AnalysisJob.create({
              id: randomUUID(),
              organizationId,
              tenderId: targetTenderId,
              scope: AnalysisScope.Tender,
              analysisVersion: version,
              promptVersion: 1,
              occurredAt: new Date(),
            });
            job.queue(new Date());
            await context.create(job);
            return "created";
          },
        });
      }

      const results = await Promise.all([attemptCreate(), attemptCreate()]);
      expect(results.filter((r) => r === "created")).toHaveLength(1);
      expect(results.filter((r) => r === "already_running")).toHaveLength(1);

      const jobs = await prisma.analysisJob.findMany({ where: { organizationId, targetId: targetTenderId } });
      expect(jobs).toHaveLength(1);
    });

    it("allows a new version once the previous job for the same target reached a terminal status", async () => {
      const { jobId, tenderId } = await seedQueuedJob();
      await repository.reserveForProcessing({ organizationId, jobId, occurredAt: new Date() });
      await repository.finalizeAttempt({
        organizationId,
        jobId,
        expectedAttemptCount: 1,
        startedAt: new Date(),
        occurredAt: new Date(),
        outcome: { kind: "succeeded", provider: "FAKE", model: "m", durationMs: 1 },
        trigger: "MANUAL",
        retryCount: 0,
      });

      const secondJob = AnalysisJob.create({
        id: randomUUID(),
        organizationId,
        tenderId,
        scope: AnalysisScope.Tender,
        analysisVersion: 2,
        promptVersion: 1,
        occurredAt: new Date(),
      });
      secondJob.queue(new Date());
      await repository.runExclusiveForTarget({
        organizationId,
        scope: AnalysisScope.Tender,
        targetId: tenderId,
        fn: async (context) => {
          const nextVersion = await context.getNextVersion({ organizationId, scope: AnalysisScope.Tender, targetId: tenderId });
          expect(nextVersion).toBe(2);
          await context.create(secondJob);
        },
      });

      const versions = (await prisma.analysisJob.findMany({ where: { organizationId, targetId: tenderId } })).map(
        (record) => record.analysisVersion,
      );
      expect(versions.sort()).toEqual([1, 2]);
    });
  });

  describe("multi-tenant isolation", () => {
    it("never returns a job belonging to another organization", async () => {
      const { jobId } = await seedQueuedJob();
      const result = await repository.findById({ organizationId: otherOrganizationId, jobId });
      expect(result).toBeNull();
    });
  });

  describe("database invariants", () => {
    it("rejects an invalid analysis_jobs.status value at the database level", async () => {
      const { jobId } = await seedQueuedJob();
      await expect(
        prisma.$executeRawUnsafe(`UPDATE analysis_jobs SET status = 'NOT_A_REAL_STATUS' WHERE id = $1`, jobId),
      ).rejects.toThrow();
    });

    it("rejects an invalid analysis_jobs.scope value at the database level", async () => {
      const { jobId } = await seedQueuedJob();
      await expect(
        prisma.$executeRawUnsafe(`UPDATE analysis_jobs SET scope = 'NOT_A_REAL_SCOPE' WHERE id = $1`, jobId),
      ).rejects.toThrow();
    });

    it("rejects a TENDER-scoped row that also carries a document_id (scope/target coherence)", async () => {
      const { jobId } = await seedQueuedJob();
      await expect(
        prisma.$executeRawUnsafe(`UPDATE analysis_jobs SET document_id = gen_random_uuid() WHERE id = $1`, jobId),
      ).rejects.toThrow();
    });

    it("rejects a duplicate (organization_id, scope, target_id, analysis_version) tuple", async () => {
      const { tenderId } = await seedQueuedJob(); // a déjà créé la version 1 pour ce Tender
      await expect(
        prisma.analysisJob.create({
          data: {
            id: randomUUID(),
            organizationId,
            tenderId,
            targetId: tenderId,
            scope: AnalysisScope.Tender,
            status: AnalysisStatus.Queued,
            analysisVersion: 1,
            promptVersion: 1,
            attemptCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }),
      ).rejects.toThrow();
    });

    it("rejects an invalid analysis_attempts.trigger value at the database level", async () => {
      const { jobId } = await seedQueuedJob();
      await expect(
        prisma.analysisAttempt.create({
          data: {
            id: randomUUID(),
            jobId,
            organizationId,
            attemptNumber: 1,
            trigger: "NOT_A_REAL_TRIGGER",
            outcome: "SUCCEEDED",
            startedAt: new Date(),
            finishedAt: new Date(),
            durationMs: 1,
          },
        }),
      ).rejects.toThrow();
    });

    it("rejects a duplicate (job_id, attempt_number) pair at the database level", async () => {
      const { jobId } = await seedQueuedJob();
      const attemptData = {
        jobId,
        organizationId,
        attemptNumber: 1,
        trigger: "MANUAL",
        outcome: "FAILED" as const,
        startedAt: new Date(),
        finishedAt: new Date(),
        durationMs: 1,
      };
      await prisma.analysisAttempt.create({ data: { id: randomUUID(), ...attemptData } });
      await expect(prisma.analysisAttempt.create({ data: { id: randomUUID(), ...attemptData } })).rejects.toThrow();
    });
  });
});
