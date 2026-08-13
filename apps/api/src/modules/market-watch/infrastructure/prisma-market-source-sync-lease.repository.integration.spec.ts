import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { PrismaMarketSourceSyncLeaseRepository } from "./prisma-market-source-sync-lease.repository";

/**
 * Sprint 21 (hardening) — mission PARTIE F : preuve réelle contre PostgreSQL que le bail empêche
 * bien deux instances de synchroniser la même (organisation, source) simultanément, et qu'il
 * expire naturellement une fois `leaseDurationMs` écoulé (jamais bloqué indéfiniment si une
 * instance crashe en cours de synchronisation).
 */
describe("PrismaMarketSourceSyncLeaseRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaMarketSourceSyncLeaseRepository(prisma);
  const organizationId = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.marketSourceSyncLease.deleteMany({ where: { organizationId } });
    await prisma.$disconnect();
  });

  it("BLOQUANT — only one of two concurrent claims for the same (organizationId, source) succeeds", async () => {
    const now = new Date();
    const results = await Promise.all([
      repository.tryClaim({ organizationId, source: "BOAMP", now, leaseDurationMs: 60_000 }),
      repository.tryClaim({ organizationId, source: "BOAMP", now, leaseDurationMs: 60_000 }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("never blocks a DIFFERENT source for the same organization", async () => {
    const now = new Date();
    await repository.tryClaim({ organizationId, source: "OTHER_SOURCE_A", now, leaseDurationMs: 60_000 });

    const claimed = await repository.tryClaim({ organizationId, source: "OTHER_SOURCE_B", now, leaseDurationMs: 60_000 });

    expect(claimed).toBe(true);
  });

  it("expires naturally — a claim succeeds again once leaseDurationMs has elapsed", async () => {
    const source = "EXPIRING_SOURCE";
    const past = new Date(Date.now() - 10_000);
    const firstClaim = await repository.tryClaim({ organizationId, source, now: past, leaseDurationMs: 1_000 }); // expires at past+1s, already in the past
    expect(firstClaim).toBe(true);

    const secondClaim = await repository.tryClaim({ organizationId, source, now: new Date(), leaseDurationMs: 60_000 });
    expect(secondClaim).toBe(true);
  });
});
