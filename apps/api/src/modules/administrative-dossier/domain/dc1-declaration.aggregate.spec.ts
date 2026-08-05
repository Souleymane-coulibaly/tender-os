import { describe, expect, it } from "vitest";
import { Dc1CandidateType, Dc1Declaration } from "./dc1-declaration.aggregate";

const NOW = new Date("2026-09-10T10:00:00.000Z");

describe("Dc1Declaration — mission §10", () => {
  it("an INDIVIDUAL candidate never carries a consortiumId, even if one is passed", () => {
    const dc1 = Dc1Declaration.create({
      id: "dc1-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      candidateType: Dc1CandidateType.Individual,
      consortiumId: "consortium-1",
      createdBy: "user-1",
      occurredAt: NOW,
    });
    expect(dc1.consortiumId).toBeUndefined();
  });

  it("a CONSORTIUM candidate keeps the provided consortiumId", () => {
    const dc1 = Dc1Declaration.create({
      id: "dc1-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      candidateType: Dc1CandidateType.Consortium,
      consortiumId: "consortium-1",
      createdBy: "user-1",
      occurredAt: NOW,
    });
    expect(dc1.consortiumId).toBe("consortium-1");
  });

  it("switching candidateType back to INDIVIDUAL via update() clears any prior consortiumId", () => {
    const dc1 = Dc1Declaration.create({ id: "dc1-1", organizationId: "org-1", tenderId: "tender-1", candidateType: Dc1CandidateType.Consortium, consortiumId: "consortium-1", createdBy: "user-1", occurredAt: NOW });
    dc1.update({ candidateType: Dc1CandidateType.Individual, occurredAt: NOW });
    expect(dc1.consortiumId).toBeUndefined();
  });

  it("linkDocument sets administrativeDocumentId", () => {
    const dc1 = Dc1Declaration.create({ id: "dc1-1", organizationId: "org-1", tenderId: "tender-1", candidateType: Dc1CandidateType.Individual, createdBy: "user-1", occurredAt: NOW });
    dc1.linkDocument({ administrativeDocumentId: "doc-1", occurredAt: NOW });
    expect(dc1.administrativeDocumentId).toBe("doc-1");
  });
});
