import { beforeEach, describe, expect, it } from "vitest";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import { InvalidMarketTypeError, TenderNotFoundError, TenderPermissionMissingError } from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import {
  createClientPortfolioTestFixture,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryTenderRepository,
} from "../../test-support/fakes";
import { UpdateTenderUseCase } from "./update-tender.use-case";

describe("UpdateTenderUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let clientPortfolio: Awaited<ReturnType<typeof createClientPortfolioTestFixture>>;
  let useCase: UpdateTenderUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    clientPortfolio = await createClientPortfolioTestFixture("org-1");
    useCase = new UpdateTenderUseCase(tenderRepository, auditLogWriter, new FixedClock(), clientPortfolio.assertClientAccessUseCase);

    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-1"),
        organizationId: "org-1",
        clientAccountId: "client-1",
        title: "Marche de nettoyage",
        marketType: "PUBLIC",
        country: "FR",
        language: "fr",
        source: "MANUAL",
        currency: "EUR",
        createdBy: "user-1",
        occurredAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );
  });

  it("updates only the provided fields and bumps the version (no regression on existing behaviour)", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      title: "Marche de nettoyage industriel",
    });

    expect(result.title).toBe("Marche de nettoyage industriel");
    expect(result.version).toBe(2);
    expect(result.marketType).toBe("PUBLIC");
    expect(auditLogWriter.entries[0]?.action).toBe("tender.updated");
  });

  it("lets an existing market of a Tender be corrected (e.g. from PUBLIC to PRIVATE)", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      marketType: "PRIVATE",
      country: "BE",
      language: "en",
      source: "PRIVATE",
      externalReference: "EXT-7",
      sourceUrl: "https://buyer.example.com/rfp/7",
    });

    expect(result.marketType).toBe("PRIVATE");
    expect(result.country).toBe("BE");
    expect(result.language).toBe("en");
    expect(result.source).toBe("PRIVATE");
    expect(result.externalReference).toBe("EXT-7");
    expect(result.sourceUrl).toBe("https://buyer.example.com/rfp/7");
  });

  it("rejects an unknown marketType", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        marketType: "NOT_A_MARKET_TYPE",
      }),
    ).rejects.toThrow(InvalidMarketTypeError);
  });

  it("throws when the tender does not exist in this organization", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "missing-tender",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        title: "x",
      }),
    ).rejects.toThrow(TenderNotFoundError);
  });

  it("refuses when the actor lacks tender:update", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "READ_ONLY",
        title: "x",
      }),
    ).rejects.toThrow(TenderPermissionMissingError);
  });

  describe("client isolation (correction P0 — mutations Tenders non client-aware)", () => {
    it("refuses a MEMBER-tier actor with NO assignment on the tender's client, even with tender:update", async () => {
      await expect(
        useCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          actorId: "user-unaffiliated",
          actorRole: "BID_MANAGER",
          title: "Tentative non autorisée",
        }),
      ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
    });

    it("OWNER can update a tender for a client it has no explicit assignment on", async () => {
      const result = await useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "owner-user",
        actorRole: "OWNER",
        title: "Mise à jour par le propriétaire",
      });
      expect(result.title).toBe("Mise à jour par le propriétaire");
    });
  });
});
