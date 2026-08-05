import { describe, expect, it } from "vitest";
import { buildDumeXmlDraft } from "./dume-xml-draft.builder";

const NOW = new Date("2026-09-10T10:00:00.000Z");

describe("buildDumeXmlDraft — mission : brouillon non officiel, jamais un schéma ESPD prétendu", () => {
  it("is well-formed XML with an explicit non-official root and warning", () => {
    const xml = buildDumeXmlDraft({ data: { legalIdentity: "SIRET 123" }, version: 1, tenderId: "tender-1", tenderTitle: "Marché de test", generatedAt: NOW });

    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(xml).toContain("<DumeBrouillonNonOfficiel>");
    expect(xml).toContain("</DumeBrouillonNonOfficiel>");
    expect(xml).toContain("<AvertissementNonOfficiel>");
    expect(xml.toLowerCase()).toContain("non officiel");
    expect(xml).toContain("SIRET 123");
  });

  it("escapes special XML characters — never a raw injection into the document", () => {
    const xml = buildDumeXmlDraft({ data: { legalIdentity: `SIRET <danger> & "quotes" 'apostrophe'` }, version: 1, tenderId: "tender-1", tenderTitle: "Marché de test", generatedAt: NOW });

    expect(xml).not.toContain("<danger>");
    expect(xml).toContain("&lt;danger&gt;");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&quot;quotes&quot;");
    expect(xml).toContain("&apos;apostrophe&apos;");
  });

  it("renders a comment placeholder instead of an empty table when there is no revenue data", () => {
    const xml = buildDumeXmlDraft({ data: {}, version: 1, tenderId: "tender-1", tenderTitle: "Marché de test", generatedAt: NOW });

    expect(xml).toContain("Aucune donnée de chiffre d'affaires");
  });
});
