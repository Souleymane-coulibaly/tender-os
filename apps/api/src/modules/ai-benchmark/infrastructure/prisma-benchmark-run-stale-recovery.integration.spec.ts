import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { BenchmarkRun } from "../domain/benchmark-run.aggregate";
import { PrismaBenchmarkRunRepository } from "./prisma-benchmark-run.repository";

/**
 * Audit Codex P1-3 — preuve réelle contre PostgreSQL que `listStaleRunning` détecte correctement,
 * via la colonne `updated_at` réellement persistée, les runs RUNNING dont la progression s'est
 * arrêtée — et que la reprise (retry -> PENDING) est bien visible en base après `save()`.
 */
describe("BenchmarkRun stale recovery — audit Codex P1-3 (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaBenchmarkRunRepository(prisma);

  const organizationId = randomUUID();
  const now = new Date("2026-07-31T10:00:00Z");

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "BenchmarkRun Stale Recovery Integration Test Org",
        slug: `stale-recovery-integration-test-org-${organizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
  });

  afterAll(async () => {
    await prisma.benchmarkRun.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  async function seedRun(input: { id: string; updatedAt: Date }): Promise<void> {
    const run = BenchmarkRun.create({
      id: input.id,
      organizationId,
      suiteId: randomUUID(),
      suiteVersion: 1,
      repetitions: 1,
      concurrencyLimit: 1,
      estimatedCostAmount: "1",
      estimatedCostCurrency: "USD",
      launchedByUserId: randomUUID(),
      occurredAt: now,
    });
    await repository.createWithModels(run, []);
    run.start(now);
    await repository.save(run);
    // `updatedAt` est piloté par `@updatedAt` côté Prisma — on force la valeur directement en SQL
    // pour simuler de façon déterministe "plus aucune progression depuis N minutes", sans devoir
    // attendre un vrai délai d'horloge murale dans le test.
    await prisma.$executeRawUnsafe(`UPDATE "benchmark_runs" SET "updated_at" = $1 WHERE "id" = $2::uuid`, input.updatedAt, input.id);
  }

  it("finds a RUNNING run whose updatedAt is older than the threshold, and not one that is recent", async () => {
    const staleId = randomUUID();
    const freshId = randomUUID();
    await seedRun({ id: staleId, updatedAt: new Date(now.getTime() - 20 * 60 * 1000) });
    await seedRun({ id: freshId, updatedAt: new Date(now.getTime() - 1000) });

    const threshold = new Date(now.getTime() - 15 * 60 * 1000);
    const stale = await repository.listStaleRunning({ updatedBefore: threshold });
    const staleIds = stale.map((r) => r.id);

    expect(staleIds).toContain(staleId);
    expect(staleIds).not.toContain(freshId);
  });

  it("persists the retry (RUNNING -> PENDING) and the incremented attempt counter durably", async () => {
    const runId = randomUUID();
    await seedRun({ id: runId, updatedAt: new Date(now.getTime() - 20 * 60 * 1000) });

    const staleRuns = await repository.listStaleRunning({ updatedBefore: new Date(now.getTime() - 15 * 60 * 1000) });
    const run = staleRuns.find((r) => r.id === runId);
    expect(run).toBeDefined();

    const outcome = run!.recoverFromStale({ occurredAt: now, errorCode: "BENCHMARK_RUN_STALE_TIMEOUT", maxAttempts: 3 });
    expect(outcome).toBe("retried");
    await repository.save(run!);

    const reloaded = await repository.findById({ organizationId, runId });
    expect(reloaded!.status).toBe("PENDING");
    expect(reloaded!.staleRecoveryAttempts).toBe(1);
    expect(reloaded!.lastErrorCode).toBe("BENCHMARK_RUN_STALE_TIMEOUT");
  });
});
