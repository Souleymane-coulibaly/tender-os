import { beforeEach, describe, expect, it } from "vitest";
import { ArchivePricingEstimateUseCase } from "./archive-pricing-estimate.use-case";
import { CreatePricingEstimateUseCase } from "./create-pricing-estimate.use-case";
import { GetPricingEstimateUseCase } from "./get-pricing-estimate.use-case";
import { ListPricingEstimatesUseCase } from "./list-pricing-estimates.use-case";
import { RecalculatePricingEstimateUseCase } from "./recalculate-pricing-estimate.use-case";
import { GetClientAccountUseCase } from "../../../client-portfolio";
import { ClientAccount } from "../../../client-portfolio/domain/client-account.aggregate";
import { ClientAssignment } from "../../../client-portfolio/domain/client-assignment.entity";
import { ClientRole } from "../../../client-portfolio/domain/client-role";
import { InMemoryClientAccountRepository } from "../../../client-portfolio/test-support/fakes";
import { GetTenderUseCase } from "../../../tenders";
import { Tender } from "../../../tenders/domain/tender.aggregate";
import { TenderId } from "../../../tenders/domain/tender-id.value-object";
import { InMemoryTenderRepository } from "../../../tenders/test-support/fakes";
import {
  buildAssertClientAccessUseCase,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryPricingEstimateRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";

const ORG = "org-1";
const OTHER_ORG = "org-2";
const CLIENT = "client-1";
const OTHER_CLIENT = "client-2";
const TENDER = "tender-1";
const NOW = new Date("2026-08-15T10:00:00.000Z");

function buildHarness() {
  const clock = new FixedClock(NOW);
  const idGenerator = new SequentialIdGenerator();
  const auditLogWriter = new InMemoryAuditLogWriter();
  const pricingEstimateRepository = new InMemoryPricingEstimateRepository();

  const { assertClientAccessUseCase, clientAssignmentRepository } = buildAssertClientAccessUseCase();
  const clientAccountRepository = new InMemoryClientAccountRepository();
  const tenderRepository = new InMemoryTenderRepository();

  const client = ClientAccount.create({ id: CLIENT, organizationId: ORG, name: "Client A", createdBy: "user-owner", occurredAt: NOW });
  void clientAccountRepository.create(client);
  const otherClient = ClientAccount.create({ id: OTHER_CLIENT, organizationId: ORG, name: "Client B", createdBy: "user-owner", occurredAt: NOW });
  void clientAccountRepository.create(otherClient);

  const tender = Tender.create({
    id: TenderId.from(TENDER),
    organizationId: ORG,
    clientAccountId: CLIENT,
    title: "Marché de fournitures",
    createdBy: "user-owner",
    occurredAt: NOW,
  });
  void tenderRepository.seed(tender);

  const getTenderUseCase = new GetTenderUseCase(tenderRepository, assertClientAccessUseCase);
  const getClientAccountUseCase = new GetClientAccountUseCase(clientAccountRepository, assertClientAccessUseCase);

  const create = new CreatePricingEstimateUseCase(
    pricingEstimateRepository,
    getTenderUseCase,
    assertClientAccessUseCase,
    auditLogWriter,
    clock,
    idGenerator,
  );
  const recalculate = new RecalculatePricingEstimateUseCase(pricingEstimateRepository, assertClientAccessUseCase, auditLogWriter, clock, idGenerator);
  const get = new GetPricingEstimateUseCase(pricingEstimateRepository, assertClientAccessUseCase);
  const list = new ListPricingEstimatesUseCase(pricingEstimateRepository, getTenderUseCase, getClientAccountUseCase, assertClientAccessUseCase);
  const archive = new ArchivePricingEstimateUseCase(pricingEstimateRepository, assertClientAccessUseCase, auditLogWriter, clock);

  return { create, recalculate, get, list, archive, pricingEstimateRepository, clientAssignmentRepository, auditLogWriter };
}

const BASE_ASSUMPTIONS = { workHours: 10, hourlyRate: "50" };

describe("Pricing estimate lifecycle (create/recalculate/get/list/archive)", () => {
  let h: ReturnType<typeof buildHarness>;
  beforeEach(() => {
    h = buildHarness();
  });

  it("OWNER can create an estimate for a Tender, computing a CALCULATED breakdown", async () => {
    const result = await h.create.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      tenderId: TENDER,
      assumptions: BASE_ASSUMPTIONS,
    });
    expect(result.status).toBe("CALCULATED");
    expect(result.currentVersion.amount).toBe("500.000000");
    expect(result.currentVersion.disclaimerText).toContain("indicative et non contractuelle");
  });

  it("ORGANIZATION_ADMIN can create an estimate for any client's Tender", async () => {
    const result = await h.create.execute({
      organizationId: ORG,
      actorId: "user-admin",
      actorRole: "ORGANIZATION_ADMIN",
      tenderId: TENDER,
      assumptions: BASE_ASSUMPTIONS,
    });
    expect(result.currentVersionNumber).toBe(1);
  });

  it("a MEMBER affecté (CONTRIBUTOR client role) CAN create an estimate", async () => {
    h.clientAssignmentRepository.create(
      ClientAssignment.create({ id: "a1", organizationId: ORG, clientAccountId: CLIENT, userId: "user-contrib", role: ClientRole.Contributor, createdBy: "user-owner", occurredAt: NOW }),
    );
    const result = await h.create.execute({
      organizationId: ORG,
      actorId: "user-contrib",
      actorRole: "CONTRIBUTOR",
      tenderId: TENDER,
      assumptions: BASE_ASSUMPTIONS,
    });
    expect(result.createdBy).toBe("user-contrib");
  });

  it("a MEMBER non affecté (no client assignment) CANNOT create an estimate", async () => {
    await expect(
      h.create.execute({ organizationId: ORG, actorId: "user-unassigned", actorRole: "CONTRIBUTOR", tenderId: TENDER, assumptions: BASE_ASSUMPTIONS }),
    ).rejects.toMatchObject({ code: "CLIENT_ACCOUNT_NOT_FOUND" });
  });

  it("a VIEWER-tier client assignment CANNOT create an estimate (read-only)", async () => {
    h.clientAssignmentRepository.create(
      ClientAssignment.create({ id: "a1", organizationId: ORG, clientAccountId: CLIENT, userId: "user-viewer", role: ClientRole.Viewer, createdBy: "user-owner", occurredAt: NOW }),
    );
    await expect(
      h.create.execute({ organizationId: ORG, actorId: "user-viewer", actorRole: "CONTRIBUTOR", tenderId: TENDER, assumptions: BASE_ASSUMPTIONS }),
    ).rejects.toMatchObject({ code: "CLIENT_PERMISSION_MISSING" });
  });

  it("un autre TENANT ne peut jamais créer une estimation sur ce Tender (introuvable)", async () => {
    await expect(
      h.create.execute({ organizationId: OTHER_ORG, actorId: "user-x", actorRole: "OWNER", tenderId: TENDER, assumptions: BASE_ASSUMPTIONS }),
    ).rejects.toMatchObject({ code: "TENDER_NOT_FOUND" });
  });

  it("un acteur affecté à un AUTRE client de la même organisation ne peut pas créer une estimation sur ce Tender", async () => {
    h.clientAssignmentRepository.create(
      ClientAssignment.create({ id: "a1", organizationId: ORG, clientAccountId: OTHER_CLIENT, userId: "user-other", role: ClientRole.ClientManager, createdBy: "user-owner", occurredAt: NOW }),
    );
    await expect(
      h.create.execute({ organizationId: ORG, actorId: "user-other", actorRole: "CONTRIBUTOR", tenderId: TENDER, assumptions: BASE_ASSUMPTIONS }),
    ).rejects.toMatchObject({ code: "CLIENT_ACCOUNT_NOT_FOUND" });
  });

  it("rejects an estimate with no usable assumption (never a fabricated zero cost)", async () => {
    await expect(
      h.create.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", tenderId: TENDER, assumptions: {} }),
    ).rejects.toThrow();
  });

  it("recalculate creates version 2, supersedes version 1, and NEVER changes version 1's frozen amount", async () => {
    const created = await h.create.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", tenderId: TENDER, assumptions: BASE_ASSUMPTIONS });

    const recalculated = await h.recalculate.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      estimateId: created.id,
      assumptions: { workHours: 20, hourlyRate: "50" },
      reason: "Le périmètre a doublé",
    });

    expect(recalculated.currentVersionNumber).toBe(2);
    expect(recalculated.currentVersion.amount).toBe("1000.000000");

    const v1 = await h.get.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", estimateId: created.id, version: 1 });
    expect(v1.currentVersion.amount).toBe("500.000000");
    expect(v1.currentVersion.status).toBe("SUPERSEDED");
  });

  it("recalculate requires a non-empty reason", async () => {
    const created = await h.create.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", tenderId: TENDER, assumptions: BASE_ASSUMPTIONS });
    await expect(
      h.recalculate.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", estimateId: created.id, assumptions: BASE_ASSUMPTIONS, reason: "  " }),
    ).rejects.toThrow();
  });

  it("archive marks the estimate ARCHIVED, and a second archive attempt throws", async () => {
    const created = await h.create.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", tenderId: TENDER, assumptions: BASE_ASSUMPTIONS });
    const archived = await h.archive.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", estimateId: created.id });
    expect(archived.status).toBe("ARCHIVED");

    await expect(h.archive.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", estimateId: created.id })).rejects.toMatchObject({
      code: "PRICING_ESTIMATE_ARCHIVED",
    });
  });

  it("recalculate refuses an ARCHIVED estimate", async () => {
    const created = await h.create.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", tenderId: TENDER, assumptions: BASE_ASSUMPTIONS });
    await h.archive.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", estimateId: created.id });

    await expect(
      h.recalculate.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", estimateId: created.id, assumptions: BASE_ASSUMPTIONS, reason: "x" }),
    ).rejects.toMatchObject({ code: "PRICING_ESTIMATE_ARCHIVED" });
  });

  it("list is scoped to the requested Tender and paginates", async () => {
    await h.create.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", tenderId: TENDER, assumptions: BASE_ASSUMPTIONS });
    const result = await h.list.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", tenderId: TENDER, limit: 20, offset: 0 });
    expect(result.total).toBe(1);
    expect(result.items[0]!.tenderId).toBe(TENDER);
  });

  it("get throws PRICING_ESTIMATE_NOT_FOUND for an unknown id, and for another tenant's estimate", async () => {
    const created = await h.create.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", tenderId: TENDER, assumptions: BASE_ASSUMPTIONS });

    await expect(h.get.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", estimateId: "does-not-exist" })).rejects.toMatchObject({
      code: "PRICING_ESTIMATE_NOT_FOUND",
    });
    await expect(h.get.execute({ organizationId: OTHER_ORG, actorId: "user-x", actorRole: "OWNER", estimateId: created.id })).rejects.toMatchObject({
      code: "PRICING_ESTIMATE_NOT_FOUND",
    });
  });

  it("simultaneous recalculation of the same estimate never produces two version 2 rows (repository guard)", async () => {
    const created = await h.create.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", tenderId: TENDER, assumptions: BASE_ASSUMPTIONS });

    const results = await Promise.allSettled([
      h.recalculate.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", estimateId: created.id, assumptions: { workHours: 11, hourlyRate: "50" }, reason: "r1" }),
      h.recalculate.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", estimateId: created.id, assumptions: { workHours: 12, hourlyRate: "50" }, reason: "r2" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: "PRICING_ESTIMATE_CONCURRENT_RECALCULATION" });
  });
});
