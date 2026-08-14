import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsumeAoCreditUseCase } from "../../../billing";
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
  let consumeAoCreditUseCase: { execute: ReturnType<typeof vi.fn> };
  let useCase: CreateTenderUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    outboxWriter = new FakeOutboxWriter();
    consumeAoCreditUseCase = { execute: vi.fn(async () => {}) };
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
      consumeAoCreditUseCase as unknown as ConsumeAoCreditUseCase,
    );
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

  it("V2 Sprint 22B (billing) — consumes exactly one AO credit for the newly created tenderId", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
      title: "Marche de nettoyage",
    });

    expect(consumeAoCreditUseCase.execute).toHaveBeenCalledTimes(1);
    expect(consumeAoCreditUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", tenderId: result.id, actorId: "user-1" }));
  });

  it("V2 Sprint 22B (billing) — insufficient AO credit blocks Tender creation entirely: no Tender saved, no audit log, no outbox event", async () => {
    class InsufficientCreditError extends Error {}
    consumeAoCreditUseCase.execute = vi.fn(async () => {
      throw new InsufficientCreditError("no credit left");
    });

    await expect(
      useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID, title: "Marche de nettoyage" }),
    ).rejects.toBeInstanceOf(InsufficientCreditError);

    expect(auditLogWriter.entries).toHaveLength(0);
    expect(outboxWriter.writes).toHaveLength(0);
    const page = await tenderRepository.list({ organizationId: "org-1", limit: 10 });
    expect(page.items).toHaveLength(0);
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
