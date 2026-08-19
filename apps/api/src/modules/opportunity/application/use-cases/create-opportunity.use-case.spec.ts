import { describe, expect, it } from "vitest";
import { CandidateCompanyArchivedError, GetCandidateCompanyUseCase } from "../../../candidate-company";
import { CreateCandidateCompanyUseCase } from "../../../candidate-company/application/use-cases/create-candidate-company.use-case";
import {
  FixedClock as CandidateFixedClock,
  InMemoryAuditLogWriter as CandidateInMemoryAuditLogWriter,
  InMemoryCandidateCompanyRepository,
} from "../../../candidate-company/test-support/fakes";
import { UuidGenerator } from "../../../../shared-kernel/id-generator";
import { BuyerNotFoundError } from "../../../tenders";
import { createClientPortfolioTestFixture, DEFAULT_TEST_CLIENT_ACCOUNT_ID, InMemoryBuyerRepository } from "../../../tenders/test-support/fakes";
import { OpportunityPermissionMissingError } from "../../domain/errors";
import { FakeOutboxWriter, FixedClock, InMemoryAuditLogWriter, InMemoryOpportunityRepository, SequentialIdGenerator } from "../../test-support/fakes";
import { CreateOpportunityUseCase } from "./create-opportunity.use-case";

const ORG = "org-1";

async function buildHarness() {
  const opportunityRepository = new InMemoryOpportunityRepository();
  const auditLogWriter = new InMemoryAuditLogWriter();
  const outboxWriter = new FakeOutboxWriter();
  const buyerRepository = new InMemoryBuyerRepository();
  const clientPortfolio = await createClientPortfolioTestFixture(ORG);
  const candidateCompanyRepository = new InMemoryCandidateCompanyRepository();
  const createCandidateCompanyUseCase = new CreateCandidateCompanyUseCase(
    candidateCompanyRepository,
    new CandidateInMemoryAuditLogWriter(),
    new CandidateFixedClock(),
    new UuidGenerator(),
  );
  const getCandidateCompanyUseCase = new GetCandidateCompanyUseCase(candidateCompanyRepository);

  const useCase = new CreateOpportunityUseCase(
    opportunityRepository,
    auditLogWriter,
    new FixedClock(),
    new SequentialIdGenerator(),
    outboxWriter,
    clientPortfolio.getClientAccountUseCase,
    clientPortfolio.assertClientAccessUseCase,
    buyerRepository,
    getCandidateCompanyUseCase,
  );

  return { opportunityRepository, auditLogWriter, outboxWriter, useCase, candidateCompanyRepository, createCandidateCompanyUseCase };
}

describe("CreateOpportunityUseCase", () => {
  it("creates a DRAFT Opportunity with source MANUAL by default", async () => {
    const { useCase, auditLogWriter } = await buildHarness();

    const result = await useCase.execute({ organizationId: ORG, actorId: "user-1", actorRole: "BID_MANAGER", title: "Fourniture de mobilier" });

    expect(result.status).toBe("DRAFT");
    expect(result.source).toBe("MANUAL");
    expect(result.version).toBe(1);
    expect(auditLogWriter.entries).toHaveLength(1);
    expect(auditLogWriter.entries[0]?.action).toBe("opportunity.created");
  });

  it("allows creation without any clientAccountId (candidate resolved later)", async () => {
    const { useCase } = await buildHarness();

    const result = await useCase.execute({ organizationId: ORG, actorId: "user-1", actorRole: "BID_MANAGER", title: "Sans candidat" });

    expect(result.clientAccountId).toBeUndefined();
  });

  it("accepts a valid, accessible clientAccountId", async () => {
    const { useCase } = await buildHarness();

    const result = await useCase.execute({ organizationId: ORG, actorId: "user-1", actorRole: "BID_MANAGER", title: "Avec candidat", clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID });

    expect(result.clientAccountId).toBe(DEFAULT_TEST_CLIENT_ACCOUNT_ID);
  });

  it("accepts a valid, non-archived candidateCompanyId (Checkpoint 2.1-A3)", async () => {
    const { useCase, createCandidateCompanyUseCase } = await buildHarness();
    const candidate = await createCandidateCompanyUseCase.execute({ organizationId: ORG, actorId: "user-1", name: "Alpha SARL" });

    const result = await useCase.execute({ organizationId: ORG, actorId: "user-1", actorRole: "BID_MANAGER", title: "Avec candidat", candidateCompanyId: candidate.id });

    expect(result.candidateCompanyId).toBe(candidate.id);
  });

  it("refuses a candidateCompanyId that does not exist", async () => {
    const { useCase } = await buildHarness();

    await expect(
      useCase.execute({ organizationId: ORG, actorId: "user-1", actorRole: "BID_MANAGER", title: "x", candidateCompanyId: "does-not-exist" }),
    ).rejects.toMatchObject({ code: "CANDIDATE_COMPANY_NOT_FOUND" });
  });

  it("refuses an archived candidateCompanyId", async () => {
    const { useCase, createCandidateCompanyUseCase, candidateCompanyRepository } = await buildHarness();
    const candidate = await createCandidateCompanyUseCase.execute({ organizationId: ORG, actorId: "user-1", name: "Alpha SARL" });
    const stored = await candidateCompanyRepository.findById({ organizationId: ORG, candidateCompanyId: candidate.id });
    stored!.archive(new Date());
    await candidateCompanyRepository.save(stored!);

    await expect(
      useCase.execute({ organizationId: ORG, actorId: "user-1", actorRole: "BID_MANAGER", title: "x", candidateCompanyId: candidate.id }),
    ).rejects.toThrow(CandidateCompanyArchivedError);
  });

  it("refuses a buyerId that does not exist", async () => {
    const { useCase } = await buildHarness();

    await expect(
      useCase.execute({ organizationId: ORG, actorId: "user-1", actorRole: "BID_MANAGER", title: "Avec acheteur invalide", buyerId: "does-not-exist" }),
    ).rejects.toThrow(BuyerNotFoundError);
  });

  it("refuses when the actor lacks opportunity:create", async () => {
    const { useCase, auditLogWriter } = await buildHarness();

    await expect(useCase.execute({ organizationId: ORG, actorId: "user-1", actorRole: "READ_ONLY", title: "x" })).rejects.toThrow(OpportunityPermissionMissingError);
    expect(auditLogWriter.entries).toHaveLength(0);
  });

  it("publishes an OpportunityCreated outbox event", async () => {
    const { useCase, outboxWriter } = await buildHarness();

    await useCase.execute({ organizationId: ORG, actorId: "user-1", actorRole: "BID_MANAGER", title: "Fourniture de mobilier" });

    expect(outboxWriter.writes).toHaveLength(1);
    expect(outboxWriter.writes[0]?.events[0]?.eventType).toBe("OpportunityCreated");
  });
});
