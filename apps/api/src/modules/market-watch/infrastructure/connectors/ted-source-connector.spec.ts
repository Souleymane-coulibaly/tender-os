import { afterEach, describe, expect, it, vi } from "vitest";
import { TedSourceConnector } from "./ted-source-connector";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * Checkpoint TENDEROS-2.1-P2.3-E3, mission §7 (TEST S2 "TED nominal") — jamais un vrai appel
 * réseau ici (non-déterministe en CI) : `fetch` est stubé avec une forme de réponse vérifiée
 * empiriquement contre l'API publique réelle (voir le connecteur). Le test réseau réel existe déjà
 * séparément dans `market-watch-http.integration.spec.ts` pour BOAMP — même discipline pour TED
 * serait redondant avec la preuve de parsing ci-dessous, qui est ce qui compte réellement (mission
 * §0 — ne jamais dupliquer un connecteur, mais un connecteur nouveau mérite bien SA propre preuve
 * de parsing défensif).
 */
describe("TedSourceConnector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("BLOQUANT — parses a real-shaped TED response into normalized CollectedTender items", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        notices: [
          {
            "publication-number": "578287-2026",
            "notice-title": { fra: "Travaux de rénovation énergétique", eng: "Energy renovation works" },
            "publication-date": "2026-08-15+01:00",
            deadline: "2026-09-20+01:00",
            "classification-cpv": ["45000000", "45000000"],
            "buyer-name": { fra: ["Ville de Test"] },
            "buyer-country": "FRA",
            "buyer-city": "Test-sur-Seine",
            "estimated-value-lot": ["1250000"],
            "estimated-value-cur-lot": ["EUR"],
            links: { pdf: { FRA: "https://ted.europa.eu/notice/578287-2026" } },
          },
        ],
        totalNoticeCount: 1,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const connector = new TedSourceConnector();
    const result = await connector.search({ limit: 20 });

    expect(result.items).toHaveLength(1);
    const item = result.items[0]!;
    expect(item.externalId).toBe("578287-2026");
    expect(item.title).toBe("Travaux de rénovation énergétique");
    expect(item.buyerName).toBe("Ville de Test");
    expect(item.country).toBe("FRA");
    expect(item.cpvCodes).toEqual(["45000000"]);
    expect(item.estimatedAmount).toBe(1250000);
    expect(item.currency).toBe("EUR");
    expect(item.sourceUrl).toBe("https://ted.europa.eu/notice/578287-2026");
    expect(item.publicationDate).toEqual(new Date("2026-08-15T00:00:00+01:00"));
    expect(item.submissionDeadline).toEqual(new Date("2026-09-20T00:00:00+01:00"));
  });

  it("BLOQUANT — parses TED's real date+offset shape (no 'T', e.g. \"2026-08-15+01:00\") instead of silently dropping it as Invalid Date", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { notices: [{ "publication-number": "4-2026", "notice-title": { eng: "Date parsing" }, "publication-date": "2026-01-02+01:00" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new TedSourceConnector().search({ limit: 20 });

    expect(result.items[0]!.publicationDate).toEqual(new Date("2026-01-02T00:00:00+01:00"));
  });

  it("drops a notice missing a required field instead of throwing (best-effort, never crashes the whole cycle)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        notices: [
          { "publication-number": "1-2026" }, // no title
          { "notice-title": { eng: "No publication number" } }, // no externalId
          { "publication-number": "2-2026", "notice-title": { eng: "Valid notice" } },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new TedSourceConnector().search({ limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.externalId).toBe("2-2026");
  });

  it("falls back to the first available language when neither fra nor eng is present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { notices: [{ "publication-number": "3-2026", "notice-title": { hrv: "Naslov na hrvatskom" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new TedSourceConnector().search({ limit: 20 });

    expect(result.items[0]!.title).toBe("Naslov na hrvatskom");
  });

  it("mission §27 — propagates on a non-OK HTTP status (retry handled by the caller, not this connector)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503, { error: "unavailable" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new TedSourceConnector().search({ limit: 20 })).rejects.toThrow(/503/);
  });

  it("mission §27 — propagates a network failure instead of swallowing it", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network unreachable"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new TedSourceConnector().search({ limit: 20 })).rejects.toThrow("network unreachable");
  });

  it("sets nextCursor only when the page appears full (items.length === limit)", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(200, { notices: [{ "publication-number": "1-2026", "notice-title": { eng: "A" } }] })));
    vi.stubGlobal("fetch", fetchMock);

    const full = await new TedSourceConnector().search({ limit: 1 });
    expect(full.nextCursor).toBe("2");

    const notFull = await new TedSourceConnector().search({ limit: 5 });
    expect(notFull.nextCursor).toBeNull();
  });
});
