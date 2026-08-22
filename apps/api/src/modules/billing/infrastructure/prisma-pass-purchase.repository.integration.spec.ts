import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { PassPurchase } from "../domain/pass-purchase.aggregate";
import { PrismaPassPurchaseRepository } from "./prisma-pass-purchase.repository";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1.2, mission §1/TEST 4 — "Utiliser une garantie DB/transactionnelle
 * réelle. Ne pas implémenter uniquement findFirstAvailable() puis update() sans protection." Preuve
 * DIRECTE contre PostgreSQL (jamais un fake en mémoire mono-thread) que la réservation d'un Pass
 * unique par deux Tenders réellement concurrents ne laisse jamais les deux gagner. Une organisation
 * FRAÎCHE par test (jamais partagée) — un Pass laissé AVAILABLE par un test précédent ne doit jamais
 * fausser le compte de Pass disponibles d'un autre test ("with only 1 Pass...").
 */
describe("PrismaPassPurchaseRepository — reserveForTender (PostgreSQL, REAL concurrency)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaPassPurchaseRepository(prisma);
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    // Nettoyage APRÈS CHAQUE test (jamais seulement en fin de fichier) — garantit qu'aucun Pass
    // AVAILABLE laissé par un test ne fuit jamais vers le suivant.
    if (createdOrganizationIds.length > 0) {
      await prisma.organizationPassPurchase.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
      createdOrganizationIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedOrganization(): Promise<string> {
    const organizationId = randomUUID();
    createdOrganizationIds.push(organizationId);
    await prisma.organization.create({
      data: { id: organizationId, name: "Pass Reservation Integration Test Org", slug: `pass-reservation-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
    return organizationId;
  }

  async function seedAvailablePass(organizationId: string): Promise<string> {
    const pass = PassPurchase.create({ id: randomUUID(), organizationId, externalReference: `cs_test_${randomUUID()}`, priceCents: 9900, currency: "EUR", occurredAt: new Date() });
    await repository.create(pass);
    return pass.id;
  }

  it("mission TEST 4 — 1 available Pass, Tender A and Tender B reserve concurrently: exactly one succeeds, the other gets refused", async () => {
    const organizationId = await seedOrganization();
    const passId = await seedAvailablePass(organizationId);
    const now = new Date();

    const [resultA, resultB] = await Promise.all([
      repository.reserveForTender({ organizationId, tenderId: randomUUID(), now }),
      repository.reserveForTender({ organizationId, tenderId: randomUUID(), now }),
    ]);

    const applied = [resultA.applied, resultB.applied];
    expect(applied.filter(Boolean)).toHaveLength(1);
    expect(applied.filter((a) => !a)).toHaveLength(1);

    const finalPass = await repository.findById(organizationId, passId);
    expect(finalPass?.status).toBe("RESERVED");
  });

  it("reserving twice for the SAME tenderId is idempotent (never a second reservation attempt, same Pass returned)", async () => {
    const organizationId = await seedOrganization();
    const tenderId = randomUUID();
    await seedAvailablePass(organizationId);

    const first = await repository.reserveForTender({ organizationId, tenderId, now: new Date() });
    const second = await repository.reserveForTender({ organizationId, tenderId, now: new Date() });

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(true);
    expect(second.purchase?.id).toBe(first.purchase?.id);
  });

  it("consumeForTender transitions a RESERVED pass to CONSUMED for the SAME tender, never picking a different one", async () => {
    const organizationId = await seedOrganization();
    const tenderId = randomUUID();
    await seedAvailablePass(organizationId);
    const reserved = await repository.reserveForTender({ organizationId, tenderId, now: new Date() });
    expect(reserved.applied).toBe(true);
    const otherAvailablePassId = await seedAvailablePass(organizationId); // un second Pass disponible ne doit jamais être choisi à la place

    const result = await repository.consumeForTender({ organizationId, passPurchaseId: reserved.purchase!.id, tenderId, occurredAt: new Date() });

    expect(result.applied).toBe(true);
    expect(result.purchase?.status).toBe("CONSUMED");
    expect(result.purchase?.consumedTenderId).toBe(tenderId);
    const untouchedOther = await repository.findById(organizationId, otherAvailablePassId);
    expect(untouchedOther?.status).toBe("AVAILABLE");
  });

  it("with only 1 Pass, once RESERVED for Tender A, a different Tender B finds nothing left to reserve", async () => {
    const organizationId = await seedOrganization();
    const tenderAId = randomUUID();
    await seedAvailablePass(organizationId);
    await repository.reserveForTender({ organizationId, tenderId: tenderAId, now: new Date() });

    const resultB = await repository.reserveForTender({ organizationId, tenderId: randomUUID(), now: new Date() });

    expect(resultB.applied).toBe(false);
    expect(resultB.purchase).toBeNull();
  });

  it("mission TEST 2 — two concurrent reservation attempts for the SAME tenderId against the SAME available Pass: exactly one logical reservation results, never a corrupted/duplicate row", async () => {
    const organizationId = await seedOrganization();
    const tenderId = randomUUID();
    const passId = await seedAvailablePass(organizationId);
    const now = new Date();

    const [resultA, resultB] = await Promise.all([
      repository.reserveForTender({ organizationId, tenderId, now }),
      repository.reserveForTender({ organizationId, tenderId, now }),
    ]);

    expect(resultA.applied).toBe(true);
    expect(resultB.applied).toBe(true);
    expect(resultA.purchase?.id).toBe(passId);
    expect(resultB.purchase?.id).toBe(passId); // les deux appels convergent vers la MÊME réservation, jamais deux Pass consommés pour un seul Tender
    const finalPass = await repository.findById(organizationId, passId);
    expect(finalPass?.status).toBe("RESERVED");
    expect(finalPass?.reservedTenderId).toBe(tenderId);
  });

  it("mission TEST 3 — reserveForTender concurrent with releaseReservation for the SAME (organization, tenderId, pass): the final DB state is always coherent, never a torn/ambiguous status", async () => {
    const organizationId = await seedOrganization();
    const tenderId = randomUUID();
    const passId = await seedAvailablePass(organizationId);
    // Établit une réservation réelle d'abord (la course porte ensuite sur RESERVED -> {reste
    // RESERVED via un second reserveForTender idempotent} vs {AVAILABLE via releaseReservation}).
    await repository.reserveForTender({ organizationId, tenderId, now: new Date() });

    await Promise.all([
      repository.reserveForTender({ organizationId, tenderId, now: new Date() }), // idempotent, ne fait jamais régresser
      repository.releaseReservation({ organizationId, passPurchaseId: passId, tenderId, occurredAt: new Date() }),
    ]);

    const finalPass = await repository.findById(organizationId, passId);
    // Les deux issues sont légitimes selon l'ordre réel d'exécution (RESERVED si la libération a
    // couru AVANT la relecture du second reserveForTender idempotent qui l'aurait re-réservé — en
    // pratique impossible ici car reserveForTender ne réserve QUE depuis AVAILABLE, jamais une
    // "re-réservation" d'un Pass déjà RESERVED par un `updateMany` — donc l'état final observable
    // est déterministe : soit RESERVED (release perdu la course), soit AVAILABLE (release gagné) —
    // JAMAIS un état incohérent (ex. RESERVED avec reservedTenderId NULL, ou AVAILABLE avec
    // reservedTenderId encore renseigné).
    expect(["RESERVED", "AVAILABLE"]).toContain(finalPass?.status);
    if (finalPass?.status === "RESERVED") {
      expect(finalPass.reservedTenderId).toBe(tenderId);
    } else {
      expect(finalPass?.reservedTenderId).toBeUndefined();
    }
  });

  it("mission TEST 4 — reserveForTender concurrent with consumeForTender for the SAME (organization, tenderId, pass): never corrupted, CONSUMED always wins over a concurrent reservation replay", async () => {
    const organizationId = await seedOrganization();
    const tenderId = randomUUID();
    const passId = await seedAvailablePass(organizationId);
    await repository.reserveForTender({ organizationId, tenderId, now: new Date() });

    await Promise.all([
      repository.reserveForTender({ organizationId, tenderId, now: new Date() }), // idempotent replay (ex. double-clic)
      repository.consumeForTender({ organizationId, passPurchaseId: passId, tenderId, occurredAt: new Date() }),
    ]);

    const finalPass = await repository.findById(organizationId, passId);
    expect(finalPass?.status).toBe("CONSUMED"); // consumeForTender l'emporte toujours, jamais régressé vers RESERVED
    expect(finalPass?.consumedTenderId).toBe(tenderId);
  });

  it("mission TEST 5 — two concurrent consumeForTender calls for the SAME (organization, tenderId, pass): exactly one logical consumption, never a corrupted double-write", async () => {
    const organizationId = await seedOrganization();
    const tenderId = randomUUID();
    const passId = await seedAvailablePass(organizationId);
    await repository.reserveForTender({ organizationId, tenderId, now: new Date() });

    const [resultA, resultB] = await Promise.all([
      repository.consumeForTender({ organizationId, passPurchaseId: passId, tenderId, occurredAt: new Date() }),
      repository.consumeForTender({ organizationId, passPurchaseId: passId, tenderId, occurredAt: new Date() }),
    ]);

    expect(resultA.applied).toBe(true);
    expect(resultB.applied).toBe(true); // idempotent : les deux "réussissent" au sens applicatif, jamais une exception
    const finalPass = await repository.findById(organizationId, passId);
    expect(finalPass?.status).toBe("CONSUMED");
    expect(finalPass?.consumedTenderId).toBe(tenderId);
  });

  it("mission §9 — releaseReservation is structurally impossible against a CONSUMED pass, even under concurrency with another consumeForTender", async () => {
    const organizationId = await seedOrganization();
    const tenderId = randomUUID();
    const passId = await seedAvailablePass(organizationId);
    await repository.reserveForTender({ organizationId, tenderId, now: new Date() });

    const [releaseResult, consumeResult] = await Promise.all([
      repository.releaseReservation({ organizationId, passPurchaseId: passId, tenderId, occurredAt: new Date() }),
      repository.consumeForTender({ organizationId, passPurchaseId: passId, tenderId, occurredAt: new Date() }),
    ]);

    expect(consumeResult.applied).toBe(true);
    const finalPass = await repository.findById(organizationId, passId);
    // Quel que soit l'ordre réel, l'état final ne peut JAMAIS être un Pass consommé qui aurait
    // ensuite été régressé vers AVAILABLE (structurellement impossible, clause WHERE status =
    // 'RESERVED') — soit release a gagné la course AVANT la consommation (Pass alors AVAILABLE,
    // puis plus JAMAIS consommé par ce consumeForTender précis puisqu'il exige RESERVED/AVAILABLE/
    // CONSUMED-même-tenderId — ici AVAILABLE reste éligible, donc consumeResult.applied=true prouve
    // que la consommation a bien eu lieu), soit consume a gagné (Pass CONSUMED, release ensuite
    // structurellement no-op).
    expect(finalPass?.status).toBe("CONSUMED");
    if (!releaseResult.applied) {
      // consume a gagné la course : release n'a jamais pu s'appliquer contre un Pass déjà CONSUMED.
      expect(finalPass?.consumedTenderId).toBe(tenderId);
    }
  });
});

describe("PrismaPassPurchaseRepository — releaseReservation (PostgreSQL, REAL concurrency)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaPassPurchaseRepository(prisma);
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (createdOrganizationIds.length > 0) {
      await prisma.organizationPassPurchase.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
      createdOrganizationIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedOrganization(): Promise<string> {
    const organizationId = randomUUID();
    createdOrganizationIds.push(organizationId);
    await prisma.organization.create({
      data: { id: organizationId, name: "Pass Release Integration Test Org", slug: `pass-release-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
    return organizationId;
  }

  async function seedAvailablePass(organizationId: string): Promise<string> {
    const pass = PassPurchase.create({ id: randomUUID(), organizationId, externalReference: `cs_test_${randomUUID()}`, priceCents: 9900, currency: "EUR", occurredAt: new Date() });
    await repository.create(pass);
    return pass.id;
  }

  it("releases a RESERVED pass back to AVAILABLE, verified against real Postgres", async () => {
    const organizationId = await seedOrganization();
    const tenderId = randomUUID();
    const passId = await seedAvailablePass(organizationId);
    await repository.reserveForTender({ organizationId, tenderId, now: new Date() });

    const result = await repository.releaseReservation({ organizationId, passPurchaseId: passId, tenderId, occurredAt: new Date() });

    expect(result.applied).toBe(true);
    const released = await repository.findById(organizationId, passId);
    expect(released?.status).toBe("AVAILABLE");
    expect(released?.reservedTenderId).toBeUndefined();
  });

  it("mission §11 TEST ÉCHEC MÉTIER — after release, a DIFFERENT Tender B can legitimately reserve the SAME Pass, proven against real Postgres", async () => {
    const organizationId = await seedOrganization();
    const tenderA = randomUUID();
    const tenderB = randomUUID();
    const passId = await seedAvailablePass(organizationId);
    await repository.reserveForTender({ organizationId, tenderId: tenderA, now: new Date() });
    await repository.releaseReservation({ organizationId, passPurchaseId: passId, tenderId: tenderA, occurredAt: new Date() });

    const result = await repository.reserveForTender({ organizationId, tenderId: tenderB, now: new Date() });

    expect(result.applied).toBe(true);
    expect(result.purchase?.id).toBe(passId);
    const finalPass = await repository.findById(organizationId, passId);
    expect(finalPass?.reservedTenderId).toBe(tenderB);
  });

  it("releasing a Pass CONSUMED for this tender is a structural no-op against real Postgres (DB-level impossibility, not just application logic)", async () => {
    const organizationId = await seedOrganization();
    const tenderId = randomUUID();
    const passId = await seedAvailablePass(organizationId);
    await repository.reserveForTender({ organizationId, tenderId, now: new Date() });
    await repository.consumeForTender({ organizationId, passPurchaseId: passId, tenderId, occurredAt: new Date() });

    const result = await repository.releaseReservation({ organizationId, passPurchaseId: passId, tenderId, occurredAt: new Date() });

    expect(result.applied).toBe(false);
    const stillConsumed = await repository.findById(organizationId, passId);
    expect(stillConsumed?.status).toBe("CONSUMED");
    expect(stillConsumed?.consumedTenderId).toBe(tenderId);
  });
});

describe("PrismaPassPurchaseRepository — mission §9 CONSUMED uniqueness (PostgreSQL, REAL DB constraint)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaPassPurchaseRepository(prisma);
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (createdOrganizationIds.length > 0) {
      await prisma.organizationPassPurchase.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
      createdOrganizationIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedOrganization(): Promise<string> {
    const organizationId = randomUUID();
    createdOrganizationIds.push(organizationId);
    await prisma.organization.create({
      data: { id: organizationId, name: "Pass Consumed Uniqueness Test Org", slug: `pass-consumed-unique-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
    return organizationId;
  }

  it("the DB itself refuses a second Pass CONSUMED for the same (organization, tenderId) — migration 20261008090000 partial unique index", async () => {
    const organizationId = await seedOrganization();
    const tenderId = randomUUID();
    const passA = PassPurchase.create({ id: randomUUID(), organizationId, externalReference: `cs_test_${randomUUID()}`, priceCents: 9900, currency: "EUR", occurredAt: new Date() });
    const passB = PassPurchase.create({ id: randomUUID(), organizationId, externalReference: `cs_test_${randomUUID()}`, priceCents: 9900, currency: "EUR", occurredAt: new Date() });
    await repository.create(passA);
    await repository.create(passB);

    // Force directement les DEUX lignes en CONSUMED pour le MÊME tenderId, en contournant le
    // compare-and-set applicatif (`consumeForTender` normal ne permettrait jamais ce scénario) —
    // c'est précisément l'invariant que l'index unique partiel DB doit REFUSER structurellement,
    // indépendamment de toute discipline applicative.
    await prisma.organizationPassPurchase.update({ where: { id: passA.id }, data: { status: "CONSUMED", consumedTenderId: tenderId, consumedAt: new Date() } });

    await expect(prisma.organizationPassPurchase.update({ where: { id: passB.id }, data: { status: "CONSUMED", consumedTenderId: tenderId, consumedAt: new Date() } })).rejects.toThrow();
  });
});
