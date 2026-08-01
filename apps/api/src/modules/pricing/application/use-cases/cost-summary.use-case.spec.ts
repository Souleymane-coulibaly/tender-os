import { beforeEach, describe, expect, it } from "vitest";
import { GetClientCostSummaryUseCase } from "./get-client-cost-summary.use-case";
import { GetOrganizationCostSummaryUseCase } from "./get-organization-cost-summary.use-case";
import { GetTenderCostSummaryUseCase } from "./get-tender-cost-summary.use-case";
import { GetClientAccountUseCase } from "../../../client-portfolio";
import { ClientAccount } from "../../../client-portfolio/domain/client-account.aggregate";
import { ClientAssignment } from "../../../client-portfolio/domain/client-assignment.entity";
import { ClientRole } from "../../../client-portfolio/domain/client-role";
import { InMemoryClientAccountRepository } from "../../../client-portfolio/test-support/fakes";
import { GetTenderUseCase } from "../../../tenders";
import { Tender } from "../../../tenders/domain/tender.aggregate";
import { TenderId } from "../../../tenders/domain/tender-id.value-object";
import { InMemoryTenderRepository } from "../../../tenders/test-support/fakes";
import { buildAssertClientAccessUseCase, FixedClock, InMemoryGenerationCostReader, InMemoryPricingEstimateRepository } from "../../test-support/fakes";
import type { GenerationCostRow } from "../ports/generation-cost-reader";

const ORG = "org-1";
const OTHER_ORG = "org-2";
const CLIENT = "client-1";
const OTHER_CLIENT = "client-2";
const TENDER_A = "tender-a";
const TENDER_B = "tender-b";
const NOW = new Date("2026-08-15T10:00:00.000Z");

function row(overrides: Partial<GenerationCostRow>): GenerationCostRow {
  return {
    generationId: "gen-x",
    clientAccountId: CLIENT,
    tenderId: TENDER_A,
    taskType: "EXECUTIVE_SUMMARY",
    status: "GENERATED",
    costAmount: "1.000000",
    currency: "EUR",
    totalTokenCount: 100,
    createdAt: NOW,
    ...overrides,
  };
}

function buildHarness() {
  const clock = new FixedClock(NOW);
  const generationCostReader = new InMemoryGenerationCostReader();
  const pricingEstimateRepository = new InMemoryPricingEstimateRepository();
  const { assertClientAccessUseCase, clientAssignmentRepository } = buildAssertClientAccessUseCase();
  const clientAccountRepository = new InMemoryClientAccountRepository();
  const tenderRepository = new InMemoryTenderRepository();

  void clientAccountRepository.create(ClientAccount.create({ id: CLIENT, organizationId: ORG, name: "Client A", createdBy: "user-owner", occurredAt: NOW }));
  void clientAccountRepository.create(ClientAccount.create({ id: OTHER_CLIENT, organizationId: ORG, name: "Client B", createdBy: "user-owner", occurredAt: NOW }));
  void tenderRepository.seed(Tender.create({ id: TenderId.from(TENDER_A), organizationId: ORG, clientAccountId: CLIENT, title: "A", createdBy: "user-owner", occurredAt: NOW }));

  const getTenderUseCase = new GetTenderUseCase(tenderRepository, assertClientAccessUseCase);
  const getClientAccountUseCase = new GetClientAccountUseCase(clientAccountRepository, assertClientAccessUseCase);

  const tenderSummary = new GetTenderCostSummaryUseCase(generationCostReader, pricingEstimateRepository, getTenderUseCase, assertClientAccessUseCase, clock);
  const clientSummary = new GetClientCostSummaryUseCase(generationCostReader, getClientAccountUseCase, assertClientAccessUseCase, clock);
  const organizationSummary = new GetOrganizationCostSummaryUseCase(generationCostReader, clock);

  return { tenderSummary, clientSummary, organizationSummary, generationCostReader, clientAssignmentRepository };
}

describe("GetTenderCostSummaryUseCase", () => {
  let h: ReturnType<typeof buildHarness>;
  beforeEach(() => {
    h = buildHarness();
    h.generationCostReader.rows.push(
      row({ generationId: "g1", costAmount: "1", taskType: "EXECUTIVE_SUMMARY" }),
      row({ generationId: "g2", costAmount: "2", taskType: "METHODOLOGY" }),
    );
  });

  it("aggregates the real technical cost by taskType for a Tender, with the disclaimer text present", async () => {
    const result = await h.tenderSummary.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", tenderId: TENDER_A });
    expect(result.technicalCost.totalsByCurrency.EUR).toBe("3.000000");
    expect(result.byTaskType.EXECUTIVE_SUMMARY!.totalsByCurrency.EUR).toBe("1.000000");
    expect(result.byTaskType.METHODOLOGY!.totalsByCurrency.EUR).toBe("2.000000");
    expect(result.disclaimerText).toContain("indicative et non contractuelle");
  });

  it("un autre tenant ne peut jamais consulter ce résumé (introuvable)", async () => {
    await expect(
      h.tenderSummary.execute({ organizationId: OTHER_ORG, actorId: "user-x", actorRole: "OWNER", tenderId: TENDER_A }),
    ).rejects.toMatchObject({ code: "TENDER_NOT_FOUND" });
  });

  it("un MEMBER non affecté ne peut pas consulter ce résumé", async () => {
    await expect(
      h.tenderSummary.execute({ organizationId: ORG, actorId: "user-unassigned", actorRole: "CONTRIBUTOR", tenderId: TENDER_A }),
    ).rejects.toMatchObject({ code: "CLIENT_ACCOUNT_NOT_FOUND" });
  });
});

describe("GetClientCostSummaryUseCase", () => {
  let h: ReturnType<typeof buildHarness>;
  beforeEach(() => {
    h = buildHarness();
    h.generationCostReader.rows.push(
      row({ generationId: "g1", tenderId: TENDER_A, clientAccountId: CLIENT, costAmount: "1" }),
      row({ generationId: "g2", tenderId: TENDER_B, clientAccountId: CLIENT, costAmount: "2" }),
      row({ generationId: "g3", tenderId: "tender-other-client", clientAccountId: OTHER_CLIENT, costAmount: "999" }),
    );
  });

  it("aggregates by Tender for the given client, NEVER including another client's cost", async () => {
    const result = await h.clientSummary.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", clientAccountId: CLIENT });
    expect(result.technicalCost.totalsByCurrency.EUR).toBe("3.000000");
    expect(result.byTender[TENDER_A]!.totalsByCurrency.EUR).toBe("1.000000");
    expect(result.byTender[TENDER_B]!.totalsByCurrency.EUR).toBe("2.000000");
    expect(result.byTender["tender-other-client"]).toBeUndefined();
  });

  it("a VIEWER assigned to this client can read the summary (read-only access still permitted)", async () => {
    h.clientAssignmentRepository.create(
      ClientAssignment.create({ id: "a1", organizationId: ORG, clientAccountId: CLIENT, userId: "user-viewer", role: ClientRole.Viewer, createdBy: "user-owner", occurredAt: NOW }),
    );
    const result = await h.clientSummary.execute({ organizationId: ORG, actorId: "user-viewer", actorRole: "CONTRIBUTOR", clientAccountId: CLIENT });
    expect(result.clientAccountId).toBe(CLIENT);
  });

  it("un MEMBER affecté à un AUTRE client ne peut pas consulter ce résumé", async () => {
    h.clientAssignmentRepository.create(
      ClientAssignment.create({ id: "a1", organizationId: ORG, clientAccountId: OTHER_CLIENT, userId: "user-other", role: ClientRole.ClientManager, createdBy: "user-owner", occurredAt: NOW }),
    );
    await expect(
      h.clientSummary.execute({ organizationId: ORG, actorId: "user-other", actorRole: "CONTRIBUTOR", clientAccountId: CLIENT }),
    ).rejects.toMatchObject({ code: "CLIENT_ACCOUNT_NOT_FOUND" });
  });
});

describe("GetOrganizationCostSummaryUseCase", () => {
  let h: ReturnType<typeof buildHarness>;
  beforeEach(() => {
    h = buildHarness();
    h.generationCostReader.rows.push(
      row({ generationId: "g1", clientAccountId: CLIENT, taskType: "EXECUTIVE_SUMMARY", costAmount: "1" }),
      row({ generationId: "g2", clientAccountId: OTHER_CLIENT, taskType: "METHODOLOGY", costAmount: "2" }),
    );
  });

  it("OWNER can read the organization-wide summary, broken down by client and taskType", async () => {
    const result = await h.organizationSummary.execute({ organizationId: ORG, actorRole: "OWNER" });
    expect(result.technicalCost.totalsByCurrency.EUR).toBe("3.000000");
    expect(result.byClient[CLIENT]!.totalsByCurrency.EUR).toBe("1.000000");
    expect(result.byClient[OTHER_CLIENT]!.totalsByCurrency.EUR).toBe("2.000000");
  });

  it("ORGANIZATION_ADMIN can read the organization-wide summary", async () => {
    await expect(h.organizationSummary.execute({ organizationId: ORG, actorRole: "ORGANIZATION_ADMIN" })).resolves.toBeDefined();
  });

  it("a non-OWNER/ADMIN role (e.g. CONTRIBUTOR, BID_MANAGER) is refused — org-wide, never delegable via a client assignment", async () => {
    await expect(h.organizationSummary.execute({ organizationId: ORG, actorRole: "CONTRIBUTOR" })).rejects.toMatchObject({
      code: "PRICING_PERMISSION_MISSING",
    });
    await expect(h.organizationSummary.execute({ organizationId: ORG, actorRole: "BID_MANAGER" })).rejects.toMatchObject({
      code: "PRICING_PERMISSION_MISSING",
    });
  });
});
