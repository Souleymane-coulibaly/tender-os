import { beforeEach, describe, expect, it } from "vitest";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import { AwardCriterion } from "../../domain/award-criterion.entity";
import { Buyer } from "../../domain/buyer.entity";
import { TenderNotFoundError } from "../../domain/errors";
import { Risk } from "../../domain/risk.entity";
import { TenderId } from "../../domain/tender-id.value-object";
import { TenderLot } from "../../domain/tender-lot.entity";
import { Tender } from "../../domain/tender.aggregate";
import {
  createClientPortfolioTestFixture,
  FixedClock,
  InMemoryAwardCriterionRepository,
  InMemoryBuyerRepository,
  InMemoryMilestoneRepository,
  InMemoryRequestedDocumentRepository,
  InMemoryRiskRepository,
  InMemoryTenderLotRepository,
  InMemoryTenderRepository,
  InMemoryTenderStatusHistoryRepository,
} from "../../test-support/fakes";
import { TenderCompletenessStatus } from "../services/tender-completeness.calculator";
import { GetTenderProfileUseCase } from "./get-tender-profile.use-case";

describe("GetTenderProfileUseCase (V2 Sprint 3 §14)", () => {
  let tenderRepository: InMemoryTenderRepository;
  let buyerRepository: InMemoryBuyerRepository;
  let lotRepository: InMemoryTenderLotRepository;
  let criterionRepository: InMemoryAwardCriterionRepository;
  let requestedDocumentRepository: InMemoryRequestedDocumentRepository;
  let milestoneRepository: InMemoryMilestoneRepository;
  let riskRepository: InMemoryRiskRepository;
  let statusHistoryRepository: InMemoryTenderStatusHistoryRepository;
  let clientPortfolio: Awaited<ReturnType<typeof createClientPortfolioTestFixture>>;
  let useCase: GetTenderProfileUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    buyerRepository = new InMemoryBuyerRepository();
    lotRepository = new InMemoryTenderLotRepository();
    criterionRepository = new InMemoryAwardCriterionRepository();
    requestedDocumentRepository = new InMemoryRequestedDocumentRepository();
    milestoneRepository = new InMemoryMilestoneRepository();
    riskRepository = new InMemoryRiskRepository();
    statusHistoryRepository = new InMemoryTenderStatusHistoryRepository();
    clientPortfolio = await createClientPortfolioTestFixture("org-1");

    useCase = new GetTenderProfileUseCase(
      tenderRepository,
      buyerRepository,
      lotRepository,
      criterionRepository,
      requestedDocumentRepository,
      milestoneRepository,
      riskRepository,
      statusHistoryRepository,
      new FixedClock(),
      clientPortfolio.getClientAccountUseCase,
      clientPortfolio.assertClientAccessUseCase,
    );

    const buyer = Buyer.create({ id: "buyer-1", organizationId: "org-1", name: "Mairie de Test", createdBy: "user-1", occurredAt: new Date("2026-01-01T00:00:00Z") });
    await buyerRepository.save(buyer);

    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-1"),
        organizationId: "org-1",
        clientAccountId: "client-1",
        title: "Marche de nettoyage",
        buyerId: "buyer-1",
        createdBy: "user-1",
        occurredAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );

    await lotRepository.seed(
      TenderLot.create({ id: "lot-1", organizationId: "org-1", tenderId: "tender-1", lotNumber: "01", title: "Lot travaux", displayOrder: 0, occurredAt: new Date("2026-01-01T00:00:00Z") }),
    );
    await criterionRepository.save(
      AwardCriterion.create({ id: "criterion-1", organizationId: "org-1", tenderId: "tender-1", name: "Prix", weight: "100", occurredAt: new Date("2026-01-01T00:00:00Z") }),
    );
    await riskRepository.save(
      Risk.create({ id: "risk-1", organizationId: "org-1", tenderId: "tender-1", title: "Delai serre", severity: "HIGH", occurredAt: new Date("2026-01-01T00:00:00Z") }),
    );
  });

  it("aggregates tender, candidate, buyer, lots, criteria, risks, history and completeness in a single call", async () => {
    const profile = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "ORGANIZATION_ADMIN" });

    expect(profile.tender.id).toBe("tender-1");
    expect(profile.candidate.id).toBe("client-1");
    expect(profile.buyer?.id).toBe("buyer-1");
    expect(profile.lots).toHaveLength(1);
    expect(profile.criteria).toHaveLength(1);
    expect(profile.risks).toHaveLength(1);
    expect(profile.requestedDocuments).toHaveLength(0);
    expect(profile.milestones).toHaveLength(0);
    expect(profile.completeness.buyer).toBe(TenderCompletenessStatus.Complete);
    expect(profile.completeness.candidate).toBe(TenderCompletenessStatus.Complete);
  });

  it("never returns banking or other sensitive candidate fields (mission §14)", async () => {
    const profile = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "ORGANIZATION_ADMIN" });

    expect(profile.candidate).not.toHaveProperty("bankAccounts");
    expect(profile.candidate).not.toHaveProperty("iban");
  });

  it("throws TenderNotFoundError when the tender does not belong to the caller's organization", async () => {
    await expect(
      useCase.execute({ organizationId: "org-2", tenderId: "tender-1", actorId: "user-1", actorRole: "ORGANIZATION_ADMIN" }),
    ).rejects.toThrow(TenderNotFoundError);
  });

  it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-unaffiliated", actorRole: "BID_MANAGER" }),
    ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
  });
});
