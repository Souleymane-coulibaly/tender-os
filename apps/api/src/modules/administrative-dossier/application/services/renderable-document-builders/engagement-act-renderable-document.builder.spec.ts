import { describe, expect, it } from "vitest";
import { buildEngagementActRenderableDocument } from "./engagement-act-renderable-document.builder";
import { EngagementAct } from "../../../domain/engagement-act.aggregate";

const NOW = new Date("2026-09-10T10:00:00.000Z");

describe("buildEngagementActRenderableDocument", () => {
  it("renders the frozen amount, never a recomputed one", () => {
    const act = EngagementAct.create({ id: "act-1", organizationId: "org-1", tenderId: "tender-1", reference: "AE-001", createdBy: "user-1", occurredAt: NOW });
    act.freezePricing({ pricingEstimateId: "estimate-1", pricingEstimateVersionNumber: 1, amountValue: 100000, amountCurrency: "EUR", frozenBy: "user-1", occurredAt: NOW });

    const document = buildEngagementActRenderableDocument({ act, tenderTitle: "Marché de test" });

    const blocks = document.sections[0]!.blocks;
    expect(blocks.some((b) => b.kind === "paragraph" && b.text.includes("Montant") && b.text.includes("100") && b.text.includes("EUR"))).toBe(true);
  });

  it("shows a notice instead of an invented amount when pricing is not frozen", () => {
    const act = EngagementAct.create({ id: "act-1", organizationId: "org-1", tenderId: "tender-1", createdBy: "user-1", occurredAt: NOW });

    const document = buildEngagementActRenderableDocument({ act, tenderTitle: "Marché de test" });

    const blocks = document.sections[0]!.blocks;
    expect(blocks.some((b) => b.kind === "notice" && b.text.includes("Aucun montant"))).toBe(true);
  });
});
