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

  /**
   * Checkpoint TENDEROS-2.1-P2.3-E12 (correctif P1, registre E13 L-02) — la forme RÉELLE de
   * `deadline` renvoyée par l'API TED, vérifiée empiriquement contre le service en production : un
   * TABLEAU, jamais une chaîne (sur 20 avis : 16 sans deadline, 4 avec un tableau, 0 avec une
   * chaîne). Le fixture du test voisin utilise une chaîne — une forme que TED ne produit jamais —
   * ce qui est exactement pourquoi `value.replace is not a function` a pu être livré et faire
   * échouer 100 % des cycles TED sans qu'aucun test ne le voie.
   */
  it("BLOQUANT — parses TED's real ARRAY-shaped deadline instead of crashing the entire source cycle", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        notices: [
          {
            "publication-number": "5-2026",
            "notice-title": { eng: "Array deadline" },
            "publication-date": "2026-08-03+02:00",
            deadline: ["2026-09-08T10:15:00+02:00"],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new TedSourceConnector().search({ limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.submissionDeadline).toEqual(new Date("2026-09-08T10:15:00+02:00"));
  });

  it("an unexpected deadline shape degrades the notice instead of failing the whole cycle (best-effort)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        notices: [{ "publication-number": "6-2026", "notice-title": { eng: "Weird deadline" }, "publication-date": "2026-08-03+02:00", deadline: { unexpected: true } }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new TedSourceConnector().search({ limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.submissionDeadline).toBeUndefined();
  });

  /**
   * Checkpoint TENDEROS-2.1-P2.3-E12 (correctif P1, registre E13 L-02) — cause racine n°2, masquée
   * par la n°1 jusqu'à ce qu'elle soit corrigée. `buyer-city` est un OBJET multilingue dans l'API
   * réelle (`{"mul":["Wanfried"]}`), pas une chaîne : typé `string`, il était transmis TEL QUEL à
   * Prisma pour une colonne `String`, qui rejetait l'insertion et faisait échouer tout le cycle TED.
   * Noter la clé `mul` — ni `fra` ni `eng` — donc seul le repli "première clé" produit une ville.
   */
  it("BLOQUANT — extracts buyer-city from TED's real multilingual OBJECT shape (never hands a raw object to persistence)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        notices: [
          {
            "publication-number": "7-2026",
            "notice-title": { eng: "Object city" },
            "buyer-city": { mul: ["Wanfried"] },
            "buyer-country": ["DEU"],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new TedSourceConnector().search({ limit: 20 });

    expect(result.items[0]!.city).toBe("Wanfried");
    expect(result.items[0]!.country).toBe("DEU");
  });

  /**
   * La garde de classe : AUCUN extracteur ne peut livrer autre chose qu'une chaîne. C'est ce qui
   * transforme une forme TED inattendue en champ manquant (avis dégradé mais ingéré) plutôt qu'en
   * échec d'insertion Prisma qui condamne la source entière — la vraie leçon des deux causes racines.
   */
  it("BLOQUANT — never emits a non-string field, whatever unexpected shape the source returns", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        notices: [
          {
            "publication-number": "8-2026",
            "notice-title": { eng: "Hostile shapes" },
            "buyer-city": { mul: [{ nested: "object" }] },
            "buyer-country": { unexpected: "object" },
            "buyer-name": { fra: [42] },
            links: { pdf: { FRA: { unexpected: "object" } } },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const item = (await new TedSourceConnector().search({ limit: 20 })).items[0]!;

    for (const [field, value] of Object.entries({ city: item.city, country: item.country, buyerName: item.buyerName, sourceUrl: item.sourceUrl })) {
      expect(value, `${field} must be undefined, never a non-string value that would break persistence`).toBeUndefined();
    }
    // L'avis reste ingéré — dégradé, jamais perdu.
    expect(item.externalId).toBe("8-2026");
    expect(item.title).toBe("Hostile shapes");
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
