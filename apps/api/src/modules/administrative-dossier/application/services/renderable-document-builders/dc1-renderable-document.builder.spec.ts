import { describe, expect, it } from "vitest";
import { buildDc1RenderableDocument } from "./dc1-renderable-document.builder";
import { Consortium, ConsortiumType } from "../../../domain/consortium.aggregate";
import { Dc1CandidateType, Dc1Declaration } from "../../../domain/dc1-declaration.aggregate";

const NOW = new Date("2026-09-10T10:00:00.000Z");

describe("buildDc1RenderableDocument", () => {
  it("renders an individual candidate without a groupement section", () => {
    const dc1 = Dc1Declaration.create({ id: "dc1-1", organizationId: "org-1", tenderId: "tender-1", candidateType: Dc1CandidateType.Individual, signatoryName: "Jean Dupont", createdBy: "user-1", occurredAt: NOW });

    const document = buildDc1RenderableDocument({ dc1, tenderTitle: "Marché de test" });

    expect(document.sections).toHaveLength(1);
    expect(document.sections[0]?.id).toBe("identite");
  });

  it("renders the groupement composition when a Consortium is linked", () => {
    const dc1 = Dc1Declaration.create({ id: "dc1-1", organizationId: "org-1", tenderId: "tender-1", candidateType: Dc1CandidateType.Consortium, consortiumId: "consortium-1", createdBy: "user-1", occurredAt: NOW });
    const consortium = Consortium.create({ id: "consortium-1", organizationId: "org-1", tenderId: "tender-1", type: ConsortiumType.Joint, createdBy: "user-1", occurredAt: NOW });
    consortium.setMembers({ members: [{ memberId: "m1", name: "Membre 1", role: "mandataire", percentage: 100 }], occurredAt: NOW });

    const document = buildDc1RenderableDocument({ dc1, consortium, tenderTitle: "Marché de test" });

    expect(document.sections).toHaveLength(2);
    const groupementSection = document.sections[1]!;
    expect(groupementSection.blocks.some((b) => b.kind === "table")).toBe(true);
  });

  it("flags a missing Consortium for a groupement candidacy without blocking generation", () => {
    const dc1 = Dc1Declaration.create({ id: "dc1-1", organizationId: "org-1", tenderId: "tender-1", candidateType: Dc1CandidateType.Consortium, createdBy: "user-1", occurredAt: NOW });

    const document = buildDc1RenderableDocument({ dc1, tenderTitle: "Marché de test" });

    const groupementSection = document.sections[1]!;
    expect(groupementSection.blocks.some((b) => b.kind === "notice")).toBe(true);
  });
});
