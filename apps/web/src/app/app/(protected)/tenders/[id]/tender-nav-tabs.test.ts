import { describe, expect, it } from "vitest";
import { buildTenderNavTabs } from "./tender-nav-tabs";

/**
 * Checkpoint 2.1-A5 (wave 2, Tender Workspace) — preuve que la structure canonique (mission §5/§25 :
 * "Vue d'ensemble / DCE / Analyse / Checklist / Administratif / Chiffrage / Mémoire technique /
 * Documents-Réponse / ...") est réellement respectée, jamais reconstruite manuellement à chaque
 * lecture de tender-nav-tabs.ts.
 */
describe("buildTenderNavTabs — canonical Tender Workspace structure", () => {
  const tabs = buildTenderNavTabs("tender-1");
  const labels = tabs.map((tab) => tab.label);

  it("BLOQUANT (mission §5/§23) — DCE, Analyse, Checklist are real tabs, immediately after Vue d'ensemble, in business-flow order", () => {
    expect(labels.slice(0, 4)).toEqual(["Vue d'ensemble", "DCE", "Analyse", "Checklist"]);
  });

  it("every tab targets a distinct, tenant-scoped route under this Tender — never a bare label with no destination", () => {
    const hrefs = tabs.map((tab) => tab.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(href.startsWith("/app/tenders/tender-1")).toBe(true);
  });

  it("BLOQUANT (mission §6/§18) — 'Chiffrage' (BPU/DPGF/DQE) and 'Estimation & coûts IA' (forecast + AI cost) stay two distinct labels/routes, never merged, never sharing the ambiguous bare word 'Pricing'", () => {
    expect(labels).toContain("Chiffrage");
    expect(labels).toContain("Estimation & coûts IA");
    expect(labels).not.toContain("Pricing");
    const chiffrage = tabs.find((tab) => tab.label === "Chiffrage");
    const estimation = tabs.find((tab) => tab.label === "Estimation & coûts IA");
    expect(chiffrage?.href).toBe("/app/tenders/tender-1/pricing-schedule");
    expect(estimation?.href).toBe("/app/tenders/tender-1/pricing");
  });

  it("mission §22 — the Response/Submission pipeline (Dossier final / Dossier de soumission / Dépôt) is preserved as three distinct stages, never merged in this wave", () => {
    expect(labels).toEqual(expect.arrayContaining(["Dossier final", "Dossier de soumission", "Dépôt"]));
  });
});
