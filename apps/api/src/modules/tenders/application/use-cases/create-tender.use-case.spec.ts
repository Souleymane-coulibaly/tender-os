import { beforeEach, describe, expect, it } from "vitest";
import {
  InvalidMarketTypeError,
  InvalidTenderCountryError,
  InvalidTenderLanguageError,
  InvalidTenderSourceError,
  TenderPermissionMissingError,
} from "../../domain/errors";
import { FixedClock, InMemoryAuditLogWriter, InMemoryTenderRepository, SequentialIdGenerator } from "../../test-support/fakes";
import { CreateTenderUseCase } from "./create-tender.use-case";

describe("CreateTenderUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let useCase: CreateTenderUseCase;

  beforeEach(() => {
    tenderRepository = new InMemoryTenderRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    useCase = new CreateTenderUseCase(tenderRepository, auditLogWriter, new FixedClock(), new SequentialIdGenerator());
  });

  it("creates a DRAFT tender and records an audit entry when the actor is a Bid Manager", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
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
        title: "Marche de nettoyage",
        language: "zz",
      }),
    ).rejects.toThrow(InvalidTenderLanguageError);
  });

  it("rejects an unknown source", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        title: "Marche de nettoyage",
        source: "NOT_A_SOURCE",
      }),
    ).rejects.toThrow(InvalidTenderSourceError);
  });
});
