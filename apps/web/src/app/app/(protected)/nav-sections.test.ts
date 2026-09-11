import { describe, expect, it } from "vitest";
import { NAV_SECTIONS } from "./nav-sections";

const allItems = NAV_SECTIONS.flatMap((section) => section.items);
const settings = NAV_SECTIONS.find((section) => section.label === "Paramètres")?.items ?? [];

describe("NAV_SECTIONS", () => {
  it("never lists the same label or the same page twice", () => {
    const labels = allItems.map((item) => item.label);
    const hrefs = allItems.map((item) => item.href);
    expect(labels.filter((label, index) => labels.indexOf(label) !== index)).toEqual([]);
    expect(hrefs.filter((href, index) => hrefs.indexOf(href) !== index)).toEqual([]);
  });

  it("Paramètres has a single AI configuration entry — the per-feature model choice is a Configuration IA tab, not a second « IA » entry", () => {
    expect(settings.filter((item) => item.href.startsWith("/app/ai-")).map((item) => item.label)).toEqual(["Configuration IA"]);
    expect(allItems.some((item) => item.label === "IA / Modèles")).toBe(false);
  });

  it("names the AI technical cost page « Coûts IA », never a « Pricing » entry that reads like the subscription", () => {
    expect(settings.find((item) => item.href === "/app/pricing")?.label).toBe("Coûts IA");
    expect(allItems.some((item) => /pricing/i.test(item.label))).toBe(false);
  });
});
