import { beforeEach, describe, expect, it } from "vitest";
import { CandidateCompanyArchivedError, GetCandidateCompanyUseCase } from "../../../candidate-company";
import { CreateCandidateCompanyUseCase } from "../../../candidate-company/application/use-cases/create-candidate-company.use-case";
import {
  FixedClock as CandidateFixedClock,
  InMemoryAuditLogWriter as CandidateInMemoryAuditLogWriter,
  InMemoryCandidateCompanyRepository,
} from "../../../candidate-company/test-support/fakes";
import { UuidGenerator } from "../../../../shared-kernel/id-generator";
import {
  InvalidMarketTypeError,
  InvalidTenderCountryError,
  InvalidTenderLanguageError,
  InvalidTenderSourceError,
  TenderPermissionMissingError,
} from "../../domain/errors";
import {
  createClientPortfolioTestFixture,
  DEFAULT_TEST_CLIENT_ACCOUNT_ID,
  FakeAtomicTransactionRunner,
  FakeOutboxWriter,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryBuyerRepository,
  InMemoryTenderRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import { CreateTenderUseCase } from "./create-tender.use-case";

describe("CreateTenderUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let outboxWriter: FakeOutboxWriter;
  let candidateCompanyRepository: InMemoryCandidateCompanyRepository;
  let createCandidateCompanyUseCase: CreateCandidateCompanyUseCase;
  let useCase: CreateTenderUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    outboxWriter = new FakeOutboxWriter();
    candidateCompanyRepository = new InMemoryCandidateCompanyRepository();
    createCandidateCompanyUseCase = new CreateCandidateCompanyUseCase(
      candidateCompanyRepository,
      new CandidateInMemoryAuditLogWriter(),
      new CandidateFixedClock(),
      new UuidGenerator(),
    );
    const clientPortfolio = await createClientPortfolioTestFixture("org-1");
    useCase = new CreateTenderUseCase(
      tenderRepository,
      new InMemoryBuyerRepository(),
      auditLogWriter,
      new FixedClock(),
      new SequentialIdGenerator(),
      outboxWriter,
      new FakeAtomicTransactionRunner(),
      clientPortfolio.getClientAccountUseCase,
      clientPortfolio.assertClientAccessUseCase,
      new GetCandidateCompanyUseCase(candidateCompanyRepository),
    );
  });

  it("accepts a valid, non-archived candidateCompanyId (Checkpoint 2.1-A3)", async () => {
    const candidate = await createCandidateCompanyUseCase.execute({ organizationId: "org-1", actorId: "user-1", name: "Alpha SARL" });

    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
      candidateCompanyId: candidate.id,
      title: "Marche de nettoyage",
    });

    expect(result.candidateCompanyId).toBe(candidate.id);
  });

  it("creates a Tender without any candidateCompanyId (never required at this stage — Checkpoint 2.1-A3 §16)", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
      title: "Marche de nettoyage",
    });

    expect(result.candidateCompanyId).toBeUndefined();
  });

  it("refuses a candidateCompanyId that does not exist", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
        candidateCompanyId: "does-not-exist",
        title: "Marche de nettoyage",
      }),
    ).rejects.toMatchObject({ code: "CANDIDATE_COMPANY_NOT_FOUND" });
  });

  it("refuses an archived candidateCompanyId", async () => {
    const candidate = await createCandidateCompanyUseCase.execute({ organizationId: "org-1", actorId: "user-1", name: "Alpha SARL" });
    const stored = await candidateCompanyRepository.findById({ organizationId: "org-1", candidateCompanyId: candidate.id });
    stored!.archive(new Date());
    await candidateCompanyRepository.save(stored!);

    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
        candidateCompanyId: candidate.id,
        title: "Marche de nettoyage",
      }),
    ).rejects.toThrow(CandidateCompanyArchivedError);
  });

  it("refuses a candidateCompanyId that belongs to a different organization (cross-tenant)", async () => {
    const otherOrgCandidate = await createCandidateCompanyUseCase.execute({ organizationId: "org-2", actorId: "user-1", name: "Beta SARL" });

    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
        candidateCompanyId: otherOrgCandidate.id,
        title: "Marche de nettoyage",
      }),
    ).rejects.toMatchObject({ code: "CANDIDATE_COMPANY_NOT_FOUND" });
  });

  it("creates a DRAFT tender and records an audit entry when the actor is a Bid Manager", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
      title: "Marche de nettoyage",
    });

    expect(result.status).toBe("DRAFT");
    expect(result.version).toBe(1);
    expect(auditLogWriter.entries).toHaveLength(1);
    expect(auditLogWriter.entries[0]?.action).toBe("tender.created");
  });

  it("refuses when the actor lacks tender:create", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "READ_ONLY",
        clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
        title: "Marche de nettoyage",
      }),
    ).rejects.toThrow(TenderPermissionMissingError);

    expect(auditLogWriter.entries).toHaveLength(0);
  });

  it("applies default market values (PUBLIC/FR/fr/MANUAL/EUR) when none are provided", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
      title: "Marche de nettoyage",
    });

    expect(result.marketType).toBe("PUBLIC");
    expect(result.country).toBe("FR");
    expect(result.language).toBe("fr");
    expect(result.source).toBe("MANUAL");
    expect(result.currency).toBe("EUR");
  });

  it("keeps a Tender created without any market field working exactly as before (no regression)", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
      title: "Marche de nettoyage",
      reference: "REF-1",
    });

    expect(result.status).toBe("DRAFT");
    expect(result.title).toBe("Marche de nettoyage");
    expect(result.reference).toBe("REF-1");
  });

  it("accepts explicit market values instead of the defaults", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
      title: "Cloud hosting framework agreement",
      marketType: "PRIVATE",
      country: "DE",
      language: "de",
      source: "PRIVATE",
      externalReference: "EXT-42",
      sourceUrl: "https://buyer.example.com/consultations/42",
      currency: "USD",
    });

    expect(result.marketType).toBe("PRIVATE");
    expect(result.country).toBe("DE");
    expect(result.language).toBe("de");
    expect(result.source).toBe("PRIVATE");
    expect(result.externalReference).toBe("EXT-42");
    expect(result.sourceUrl).toBe("https://buyer.example.com/consultations/42");
    expect(result.currency).toBe("USD");
  });

  it("rejects an unknown marketType", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
        title: "Marche de nettoyage",
        marketType: "NOT_A_MARKET_TYPE",
      }),
    ).rejects.toThrow(InvalidMarketTypeError);
  });

  it("rejects an unknown country", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
        title: "Marche de nettoyage",
        country: "XX",
      }),
    ).rejects.toThrow(InvalidTenderCountryError);
  });

  it("rejects an unknown language", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
        title: "Marche de nettoyage",
        language: "zz",
      }),
    ).rejects.toThrow(InvalidTenderLanguageError);
  });

  it("Checkpoint P2.3-E1.1, FINDING 4 — creating a Tender never consumes an AO credit anymore (moved to first TenderSubmission)", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
      title: "Marche de nettoyage",
    });

    expect(result.status).toBe("DRAFT");
    expect(auditLogWriter.entries).toHaveLength(1);
    expect(outboxWriter.writes).toHaveLength(1);
  });

  it("rejects an unknown source", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
        title: "Marche de nettoyage",
        source: "NOT_A_SOURCE",
      }),
    ).rejects.toThrow(InvalidTenderSourceError);
  });
});
