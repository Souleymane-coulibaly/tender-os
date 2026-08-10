import { describe, expect, it } from "vitest";
import { extractBodyXml, extractOutline, splitBody } from "./docx-outline-extractor";
import { buildTenderOsSystemMemoTemplate, SYSTEM_TEMPLATE_VERSION } from "./system-template-builder";

describe("buildTenderOsSystemMemoTemplate (Parcours B — mission §20)", () => {
  it("BLOQUANT — produit un DOCX analysable par le MÊME pipeline que les modèles uploadés (pas de chemin parallèle)", async () => {
    const buffer = await buildTenderOsSystemMemoTemplate();
    const body = extractBodyXml(buffer);
    const segments = splitBody(body);
    const outline = extractOutline(segments);

    expect(outline).toHaveLength(12);
    expect(outline[0]!.title).toContain("Présentation de l'entreprise");
    expect(outline[10]!.title).toContain("Références");
    expect(outline.every((heading) => heading.level === 1)).toBe(true);
    expect(outline.every((heading) => heading.instructionText && heading.instructionText.length > 0)).toBe(true);
  });

  it("expose une version explicite (mission — gabarit système versionné, immuable)", () => {
    expect(SYSTEM_TEMPLATE_VERSION).toBeGreaterThanOrEqual(1);
  });
});
