import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { Money } from "../domain/money.value-object";
import { PricingAssumptions } from "../domain/pricing-assumptions";
import { PricingEstimate } from "../domain/pricing-estimate.aggregate";
import { PricingEstimateVersion } from "../domain/pricing-estimate-version.entity";
import { PricingType } from "../domain/pricing-type";
import { CostBreakdownLine } from "../domain/cost-breakdown-line";
import { PricingSource } from "../domain/pricing-source";
import { PricingStatus } from "../domain/pricing-status";
import { PrismaPricingEstimateRepository } from "./prisma-pricing-estimate.repository";

/**
 * Preuve PostgreSQL réelle (mission Sprint 7 §"Tests obligatoires — Infrastructure") — un simple
 * fake en mémoire ne suffit pas à démontrer que la contrainte unique `(estimateId, version)` protège
 * réellement contre un recalcul concurrent, ni que le breakdown Decimal survit un aller-retour réel.
 */
describe("PrismaPricingEstimateRepository (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaPricingEstimateRepository(prisma);

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const clientAccountId = randomUUID();
  const tenderId = randomUUID();
  const now = new Date("2026-08-15T10:00:00Z");

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: organizationId, name: "Pricing Repo Test Org", slug: `pricing-repo-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: otherOrganizationId, name: "Pricing Repo Test Org (other)", slug: `pricing-repo-test-org-other-${otherOrganizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    await prisma.clientAccount.create({
      data: { id: clientAccountId, organizationId, name: "Client", nameNormalized: "client", status: "ACTIVE", createdBy: randomUUID() },
    });
    await prisma.tender.create({
      data: { id: tenderId, organizationId, clientAccountId, title: "Marché de test", status: "DRAFT", tags: [], createdBy: randomUUID() },
    });
  });

  afterAll(async () => {
    await prisma.pricingEstimate.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.tender.deleteMany({ where: { organizationId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.pricingEstimate.deleteMany({ where: { organizationId } });
  });

  function buildEstimateAndVersion(id: string) {
    const estimate = PricingEstimate.create({
      id,
      organizationId,
      clientAccountId,
      tenderId,
      type: PricingType.TenderEstimate,
      createdBy: randomUUID(),
      occurredAt: now,
    });
    const version = PricingEstimateVersion.create({
      id: randomUUID(),
      estimateId: id,
      organizationId,
      version: 1,
      amount: Money.create({ amount: "123.456789", currency: "EUR" }),
      breakdown: [
        CostBreakdownLine.create({
          type: "AI_COST",
          label: "Coût IA estimé",
          quantity: "1000000",
          unit: "tokens",
          unitPrice: Money.create({ amount: "5", currency: "EUR" }),
          amount: Money.create({ amount: "123.456789", currency: "EUR" }),
          source: PricingSource.Estimated,
          displayOrder: 0,
        }),
      ],
      assumptions: PricingAssumptions.create({ estimatedGenerationsCount: 3, notes: "Hypothèse initiale" }),
      status: PricingStatus.Calculated,
      disclaimerVersion: 1,
      source: "MANUAL",
      createdBy: estimate.createdBy,
      createdAt: now,
    });
    estimate.attachVersion({ versionId: version.id, versionNumber: 1, status: PricingStatus.Calculated });
    return { estimate, version };
  }

  it("creates the header and its first version atomically, round-tripping Decimal precision and the breakdown", async () => {
    const { estimate, version } = buildEstimateAndVersion(randomUUID());
    await repository.createWithFirstVersion({ estimate, version });

    const found = await repository.findById({ organizationId, estimateId: estimate.id });
    expect(found).not.toBeNull();
    expect(found!.version.amount.toFixed()).toBe("123.456789");
    expect(found!.version.breakdown).toHaveLength(1);
    expect(found!.version.breakdown[0]!.unitPrice!.toFixed()).toBe("5.000000");
    expect(found!.version.assumptions.notes).toBe("Hypothèse initiale");
  });

  it("never leaks an estimate across organizations", async () => {
    const { estimate, version } = buildEstimateAndVersion(randomUUID());
    await repository.createWithFirstVersion({ estimate, version });

    const asOtherOrg = await repository.findById({ organizationId: otherOrganizationId, estimateId: estimate.id });
    expect(asOtherOrg).toBeNull();
  });

  it("addVersion supersedes the previous version without ever changing its frozen amount, and updates the header pointer", async () => {
    const { estimate, version: v1 } = buildEstimateAndVersion(randomUUID());
    await repository.createWithFirstVersion({ estimate, version: v1 });

    const v2 = PricingEstimateVersion.create({
      id: randomUUID(),
      estimateId: estimate.id,
      organizationId,
      version: 2,
      amount: Money.create({ amount: "200", currency: "EUR" }),
      breakdown: [],
      assumptions: PricingAssumptions.create({ additionalFeesAmount: "200" }),
      status: PricingStatus.Calculated,
      disclaimerVersion: 1,
      source: "MANUAL",
      createdBy: estimate.createdBy,
      createdAt: now,
      recalculationReason: "Changement de périmètre",
    });
    v1.supersede(now);
    estimate.attachVersion({ versionId: v2.id, versionNumber: 2, status: PricingStatus.Calculated });

    await repository.addVersion({ estimate, previousVersion: v1, newVersion: v2 });

    const reread = await repository.findById({ organizationId, estimateId: estimate.id });
    expect(reread!.version.version).toBe(2);
    expect(reread!.version.amount.toFixed()).toBe("200.000000");

    const rereadV1 = await repository.findVersion({ organizationId, estimateId: estimate.id, version: 1 });
    expect(rereadV1!.amount.toFixed()).toBe("123.456789");
    expect(rereadV1!.status).toBe(PricingStatus.Superseded);
  });

  it("a real concurrent recalculation (two addVersion calls racing on the same next version number) never creates two rows — the unique constraint rejects the loser", async () => {
    const { estimate, version: v1 } = buildEstimateAndVersion(randomUUID());
    await repository.createWithFirstVersion({ estimate, version: v1 });

    function buildV2(): PricingEstimateVersion {
      return PricingEstimateVersion.create({
        id: randomUUID(),
        estimateId: estimate.id,
        organizationId,
        version: 2,
        amount: Money.create({ amount: "1", currency: "EUR" }),
        breakdown: [],
        assumptions: PricingAssumptions.create({ additionalFeesAmount: "1" }),
        status: PricingStatus.Calculated,
        disclaimerVersion: 1,
        source: "MANUAL",
        createdBy: estimate.createdBy,
        createdAt: now,
      });
    }

    const results = await Promise.allSettled([
      repository.addVersion({ estimate, previousVersion: v1, newVersion: buildV2() }),
      repository.addVersion({ estimate, previousVersion: v1, newVersion: buildV2() }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ code: "PRICING_ESTIMATE_CONCURRENT_RECALCULATION" });

    const versions = await repository.listVersions({ organizationId, estimateId: estimate.id });
    expect(versions.filter((v) => v.version === 2)).toHaveLength(1);
  });

  it("list() excludes archived estimates by default, and includes them when explicitly requested", async () => {
    const { estimate, version } = buildEstimateAndVersion(randomUUID());
    await repository.createWithFirstVersion({ estimate, version });
    estimate.archive(now);
    await repository.save(estimate);

    const withoutArchived = await repository.list({ organizationId, tenderId, limit: 20, offset: 0 });
    expect(withoutArchived.items.find((i) => i.estimate.id === estimate.id)).toBeUndefined();

    const withArchived = await repository.list({ organizationId, tenderId, includeArchived: true, limit: 20, offset: 0 });
    expect(withArchived.items.find((i) => i.estimate.id === estimate.id)).toBeDefined();
  });
});
