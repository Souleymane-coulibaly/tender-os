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

  // Diagnostic runtime E10 — scénario A/B/C/D complet exigé par la mission, contre PostgreSQL réel.
  it("BLOQUANT (diagnostic E10, scénario nominal) — A claims, B is refused, A RELEASES on completion, then the next run claims immediately (never waiting out the full TTL)", async () => {
    const source = "RELEASE_ON_COMPLETION";
    const now = new Date();

    // A. worker A prend le bail (TTL 10 min, comme en production).
    const claimA = await repository.tryClaim({ organizationId, source, now, leaseDurationMs: 10 * 60 * 1000 });
    expect(claimA).toBe(true);

    // B. worker B est correctement refusé pendant que A travaille.
    const claimB = await repository.tryClaim({ organizationId, source, now: new Date(now.getTime() + 1_000), leaseDurationMs: 10 * 60 * 1000 });
    expect(claimB).toBe(false);

    // C. A termine (11 s plus tard, durée réelle observée en production) et LIBÈRE le bail.
    const completionTime = new Date(now.getTime() + 11_000);
    await repository.release({ organizationId, source, now: completionTime });

    // D. le run suivant (1 s après la fin de A — jamais 10 minutes plus tard) reprend le bail.
    const claimNext = await repository.tryClaim({ organizationId, source, now: new Date(completionTime.getTime() + 1_000), leaseDurationMs: 10 * 60 * 1000 });
    expect(claimNext).toBe(true);
  });

  it("BLOQUANT (diagnostic E10, scénario crash) — A claims then crashes WITHOUT releasing: B stays refused inside the TTL, then reclaims automatically once the TTL elapses", async () => {
    const source = "CRASH_RECOVERY";
    const ttlMs = 10 * 60 * 1000;
    const t0 = new Date();

    // A. worker A prend le bail puis crashe (aucun release ne sera jamais appelé).
    const claimA = await repository.tryClaim({ organizationId, source, now: t0, leaseDurationMs: ttlMs });
    expect(claimA).toBe(true);

    // B. pendant le TTL, B reste correctement refusé (le bail n'est pas encore présumé mort).
    const withinTtl = new Date(t0.getTime() + ttlMs - 1_000);
    expect(await repository.tryClaim({ organizationId, source, now: withinTtl, leaseDurationMs: ttlMs })).toBe(false);

    // C/D. temps avancé AU-DELÀ du TTL (horloge contrôlée via le paramètre `now`, jamais une vraie
    // attente) : B reprend automatiquement le bail — un crash ne bloque jamais BOAMP définitivement.
    const afterTtl = new Date(t0.getTime() + ttlMs + 1_000);
    expect(await repository.tryClaim({ organizationId, source, now: afterTtl, leaseDurationMs: ttlMs })).toBe(true);
  });

  it("release never REVIVES or extends an already-expired lease, and is a no-op when no lease exists", async () => {
    const source = "RELEASE_SAFETY";
    const t0 = new Date();

    // Aucun bail : release est un no-op silencieux.
    await repository.release({ organizationId, source, now: t0 });

    // Bail déjà expiré : release ne le ramène jamais à `now` (ce qui le RALLONGERAIT).
    const past = new Date(t0.getTime() - 60_000);
    await repository.tryClaim({ organizationId, source, now: past, leaseDurationMs: 1_000 }); // expiré depuis longtemps
    await repository.release({ organizationId, source, now: t0 });
    const row = await prisma.marketSourceSyncLease.findUnique({ where: { organizationId_source: { organizationId, source } } });
    expect(row!.lockedUntil.getTime()).toBe(past.getTime() + 1_000);
  });
});
